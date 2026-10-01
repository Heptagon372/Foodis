"""① 위키백과 제목 → Wikidata QID 해석 + SPARQL로 구조화 데이터 수집.

입력: data/seed/dish_targets.csv
출력: data/raw/wikidata.json  {slug: {...}}
라이선스: Wikidata = CC0 (출처 표기 의무 없음, 단 sources 테이블에 기록)
"""
from __future__ import annotations

from common import RAW, SEED, Http, chunks, read_csv, write_json

WIKI_API = "https://en.wikipedia.org/w/api.php"
SPARQL = "https://query.wikidata.org/sparql"


def resolve_titles(http: Http, titles: list[str]) -> dict[str, dict]:
    """en 위키 제목 50개씩 → {원래 제목: {qid, en_title, ko_title}} (리다이렉트·정규화 추적)."""
    out: dict[str, dict] = {}
    for batch in chunks(titles, 50):
        res = http.get(WIKI_API, params={
            "action": "query", "format": "json", "formatversion": 2, "redirects": 1,
            "prop": "pageprops|langlinks", "ppprop": "wikibase_item", "lllang": "ko",
            "titles": "|".join(batch),
        })
        q = res.get("query", {})
        alias = {t: t for t in batch}
        for step in ("normalized", "redirects"):
            for m in q.get(step, []):
                for orig, cur in list(alias.items()):
                    if cur == m["from"]:
                        alias[orig] = m["to"]
        pages = {p["title"]: p for p in q.get("pages", [])}
        for orig, final in alias.items():
            p = pages.get(final, {})
            if p.get("missing") or "pageprops" not in p:
                continue
            ko = (p.get("langlinks") or [{}])[0].get("title")
            out[orig] = {"qid": p["pageprops"]["wikibase_item"], "en_title": final, "ko_title": ko}
    return out


def search_title(http: Http, query: str) -> str | None:
    """제목 매칭 실패 시 검색 1순위 결과로 대체 (사람 검수 대상 표시)."""
    res = http.get(WIKI_API, params={"action": "query", "list": "search", "srsearch": f"{query} dish",
                                     "srlimit": 1, "format": "json", "formatversion": 2})
    hits = res.get("query", {}).get("search", [])
    return hits[0]["title"] if hits else None


SPARQL_TMPL = """
SELECT ?item ?labelKo ?labelEn ?origin ?originCode ?image
       (GROUP_CONCAT(DISTINCT ?matEn; separator="|") AS ?materials)
       (GROUP_CONCAT(DISTINCT ?matQ; separator="|") AS ?materialQids)
       (GROUP_CONCAT(DISTINCT ?instEn; separator="|") AS ?instanceOf)
WHERE {
  VALUES ?item { %s }
  OPTIONAL { ?item rdfs:label ?labelKo FILTER(LANG(?labelKo) = "ko") }
  OPTIONAL { ?item rdfs:label ?labelEn FILTER(LANG(?labelEn) = "en") }
  OPTIONAL { ?item wdt:P495 ?origin . OPTIONAL { ?origin wdt:P297 ?originCode } }
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { { ?item wdt:P186 ?matQ } UNION { ?item wdt:P527 ?matQ }
             ?matQ rdfs:label ?matEn FILTER(LANG(?matEn) = "en") }
  OPTIONAL { ?item wdt:P31 ?inst . ?inst rdfs:label ?instEn FILTER(LANG(?instEn) = "en") }
}
GROUP BY ?item ?labelKo ?labelEn ?origin ?originCode ?image
"""


def parse_sparql(res: dict) -> dict[str, dict]:
    """SPARQL JSON → {qid: {...}}. 원산지가 여러 개면 리스트로 합친다."""
    out: dict[str, dict] = {}
    for b in res.get("results", {}).get("bindings", []):
        qid = b["item"]["value"].rsplit("/", 1)[-1]
        v = lambda k: b.get(k, {}).get("value")  # noqa: E731
        d = out.setdefault(qid, {"qid": qid, "label_ko": v("labelKo"), "label_en": v("labelEn"),
                                 "origin_codes": [], "image_file": None, "materials": [],
                                 "material_qids": [], "instance_of": []})
        if v("originCode") and v("originCode") not in d["origin_codes"]:
            d["origin_codes"].append(v("originCode"))
        if v("image") and not d["image_file"]:
            d["image_file"] = v("image").rsplit("/", 1)[-1]
        for key, field in (("materials", "materials"), ("materialQids", "material_qids"), ("instanceOf", "instance_of")):
            for x in (v(key) or "").split("|"):
                x = x.rsplit("/", 1)[-1] if field == "material_qids" else x
                if x and x not in d[field]:
                    d[field].append(x)
    return out


def main() -> None:
    http = Http(min_interval=0.5)
    targets = read_csv(SEED / "dish_targets.csv")
    resolved = resolve_titles(http, [t["wiki_en_title"] for t in targets])

    result, unresolved = {}, []
    for t in targets:
        r = resolved.get(t["wiki_en_title"])
        if not r:
            alt = search_title(http, t["name_en"])
            r = resolve_titles(http, [alt]).get(alt) if alt else None
            if r:
                r["needs_review"] = f"제목 '{t['wiki_en_title']}' 없음 → 검색 결과 '{alt}' 사용"
        if not r:
            unresolved.append(t["slug"])
            continue
        result[t["slug"]] = {**r, "target_country": t["country_code"]}

    qids = sorted({r["qid"] for r in result.values()})
    wd: dict[str, dict] = {}
    for batch in chunks(qids, 40):
        res = http.get(SPARQL, params={"query": SPARQL_TMPL % " ".join(f"wd:{q}" for q in batch), "format": "json"},
                       headers={"Accept": "application/sparql-results+json"})
        wd.update(parse_sparql(res))
    for slug, r in result.items():
        r.update(wd.get(r["qid"], {}))
        if r.get("origin_codes") and r["target_country"] not in r["origin_codes"]:
            r["origin_mismatch"] = True  # Wikidata 원산지와 우리 국가 배정이 다름 → 검수 시 origin_note 확인

    write_json(RAW / "wikidata.json", result)
    print(f"✔ {len(result)}/{len(targets)} 해석 완료 → data/raw/wikidata.json")
    if unresolved:
        print(f"⚠ 미해석 {len(unresolved)}개 (dish_targets.csv 의 wiki_en_title 수정 필요): {', '.join(unresolved)}")
    mism = [s for s, r in result.items() if r.get("origin_mismatch")]
    if mism:
        print(f"ℹ 원산지 불일치 {len(mism)}개 (검수 대상): {', '.join(mism)}")


if __name__ == "__main__":
    main()
