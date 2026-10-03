"""⓪b TasteAtlas 사이트맵 기반 음식 후보 발견

TasteAtlas 사이트맵(공개 XML)에서 음식 slug(이름)만 추출하고,
Wikidata 에서 매칭하여 기존 dish_targets.csv 에 없는 새 후보를 찾는다.

TasteAtlas 콘텐츠는 저장하지 않는다 — 사이트맵의 URL slug 과 이미지 캡션(음식 이름)만
Wikidata/Wikipedia 검색의 시드로 사용한다.

입력: TasteAtlas sitemap (dishes.xml, ingredients.xml), data/seed/dish_targets.csv
출력: data/raw/tasteatlas_candidates.json (Wikidata 매칭 결과)
      data/seed/dish_targets.csv (--apply 시 새 후보 병합)

  python scripts/s00b_tasteatlas_discover.py                  # 후보 발견만
  python scripts/s00b_tasteatlas_discover.py --apply          # dish_targets.csv 에 병합
  python scripts/s00b_tasteatlas_discover.py --max-resolve 500 # Wikidata 검색 수 제한
"""
from __future__ import annotations

import argparse
import csv
import re
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

from common import RAW, SEED, Http, chunks, read_csv, read_json, slugify, write_json

SITEMAP_BASE = "https://www.tasteatlas.com/sitemaps"
SPARQL = "https://query.wikidata.org/sparql"
WIKI_API = "https://en.wikipedia.org/w/api.php"
WD_API = "https://www.wikidata.org/w/api.php"
AUTO_NOTE = "자동 후보"
TA_NOTE = "TA 발견"

FOOD = "Q2095"
EXCLUDE_ROOTS = {"Q154": "술", "Q11004": "채소", "Q3314483": "과일", "Q12117": "곡물"}
EXCLUDE_INSTANCE = {"Q431289": "상표", "Q167270": "상표", "Q2424752": "상품", "Q4886": "품종", "Q16521": "분류군"}

TARGET_FIELDS = ["slug", "name_ko", "name_en", "country_code", "wiki_en_title", "origin_note", "demo_required"]


def parse_sitemap(http: Http, url: str) -> list[dict[str, str]]:
    """사이트맵 XML → [{slug, caption}] (slug: URL 경로, caption: 이미지 캡션=음식 이름)"""
    r = http.s.get(url, timeout=60, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        "Accept": "application/xml, text/xml, */*",
    })
    r.raise_for_status()
    root = ET.fromstring(r.content)
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9",
          "img": "http://www.google.com/schemas/sitemap-image/1.1"}
    items = []
    for url_el in root.findall("s:url", ns):
        loc = url_el.findtext("s:loc", "", ns)
        m = re.search(r"tasteatlas\.com/([a-z0-9][\w-]+)$", loc, re.I)
        if not m:
            continue
        slug = m.group(1)
        caption = ""
        img = url_el.find("img:image/img:caption", ns)
        if img is not None and img.text:
            caption = img.text.strip()
        items.append({"slug": slug, "caption": caption})
    return items


def slug_to_search_name(slug: str) -> str:
    """slug 을 검색할 수 있는 이름으로 변환: wiener-schnitzel → Wiener schnitzel"""
    return slug.replace("-", " ").strip().capitalize()


def resolve_via_wikidata(http: Http, names: list[str]) -> dict[str, dict]:
    """Wikidata SPARQL 배치 쿼리로 이름 → QID 매핑. rdfs:label 정확 매칭 (대소문자 변형 포함)."""
    BATCH = 80
    query_tmpl = """
SELECT ?item ?label ?sl WHERE {
  VALUES ?label { %s }
  ?item rdfs:label ?label .
  ?item wikibase:sitelinks ?sl .
  FILTER(?sl > 2)
}
ORDER BY ?label DESC(?sl)
"""
    out: dict[str, dict] = {}
    for i, batch in enumerate(chunks(names, BATCH)):
        variants: set[str] = set()
        for n in batch:
            variants.add(f'"{n}"@en')
            low = n[0].lower() + n[1:] if len(n) > 1 else n.lower()
            if low != n:
                variants.add(f'"{low}"@en')
        values = " ".join(sorted(variants))
        try:
            res = http.post(SPARQL, data={"query": query_tmpl % values, "format": "json"},
                            headers={"Accept": "application/sparql-results+json"})
            for b in res["results"]["bindings"]:
                qid = b["item"]["value"].rsplit("/", 1)[-1]
                label = b["label"]["value"]
                sl = int(b.get("sl", {}).get("value", 0))
                key = label.lower()
                if key not in out or sl > out[key].get("_sl", 0):
                    out[key] = {"title": label, "qid": qid, "pageid": 0, "_sl": sl}
        except Exception as e:
            print(f"  ⚠ SPARQL 배치 {i} 오류: {e}")
        done = min((i + 1) * BATCH, len(names))
        if done % 400 == 0 or done == len(names):
            print(f"  · 검색 {done}/{len(names)} ({len(out)}건 매칭)")
    for v in out.values():
        v.pop("_sl", None)
    return out


def resolve_via_wikipedia(http: Http, names: list[str]) -> dict[str, dict]:
    """Wikipedia 검색 API 로 이름 → 영어 위키 문서 제목 매핑. 리디렉트도 처리."""
    out: dict[str, dict] = {}
    for batch in chunks(names, 20):
        titles_param = "|".join(batch)
        r = http.get(WIKI_API, params={
            "action": "query", "format": "json", "formatversion": 2,
            "titles": titles_param, "redirects": 1, "prop": "pageprops",
            "ppprop": "wikibase_item",
        })
        redirects_map = {}
        for rd in r.get("query", {}).get("redirects", []):
            redirects_map[rd["from"].lower()] = rd["to"]
        normalized_map = {}
        for nm in r.get("query", {}).get("normalized", []):
            normalized_map[nm["from"].lower()] = nm["to"]
        for page in r.get("query", {}).get("pages", []):
            if page.get("missing"):
                continue
            title = page["title"]
            qid = page.get("pageprops", {}).get("wikibase_item")
            if qid:
                out[title.lower()] = {"title": title, "qid": qid, "pageid": page["pageid"]}
    return out


def search_wikipedia(http: Http, name: str) -> dict | None:
    """Wikipedia 검색 API 로 이름 검색 → 첫 번째 결과의 QID"""
    r = http.get(WIKI_API, params={
        "action": "query", "format": "json", "formatversion": 2,
        "list": "search", "srsearch": name, "srnamespace": 0, "srlimit": 1,
    })
    hits = r.get("query", {}).get("search", [])
    if not hits:
        return None
    title = hits[0]["title"]
    r2 = http.get(WIKI_API, params={
        "action": "query", "format": "json", "formatversion": 2,
        "titles": title, "prop": "pageprops", "ppprop": "wikibase_item",
    })
    for page in r2.get("query", {}).get("pages", []):
        qid = page.get("pageprops", {}).get("wikibase_item")
        if qid:
            return {"title": page["title"], "qid": qid, "pageid": page["pageid"]}
    return None


def wikidata_details(http: Http, qids: list[str]) -> dict[str, dict]:
    """Wikidata SPARQL: QID → {qid, sitelinks, en_title, ko_title, ko_label, origins, instance_of, subclass_of, product}"""
    query_tmpl = """
SELECT ?item ?sl ?enTitle ?koTitle ?koLabel ?mfr
       (GROUP_CONCAT(DISTINCT ?p31; separator="|") AS ?inst)
       (GROUP_CONCAT(DISTINCT ?p279; separator="|") AS ?sup)
       (GROUP_CONCAT(DISTINCT ?origin; separator="|") AS ?origins)
WHERE {
  VALUES ?item { %s }
  ?item wikibase:sitelinks ?sl .
  OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?enTitle . }
  OPTIONAL { ?item wdt:P31 ?p31 }
  OPTIONAL { ?item wdt:P279 ?p279 }
  OPTIONAL { ?item wdt:P495/wdt:P297 ?origin }
  OPTIONAL { ?item wdt:P176 ?mfr }
  OPTIONAL { ?ko schema:about ?item ; schema:isPartOf <https://ko.wikipedia.org/> ; schema:name ?koTitle . }
  OPTIONAL { ?item rdfs:label ?koLabel FILTER(LANG(?koLabel) = "ko") }
}
GROUP BY ?item ?sl ?enTitle ?koTitle ?koLabel ?mfr
"""
    out: dict[str, dict] = {}
    for i, batch in enumerate(chunks(sorted(qids), 200)):
        values = " ".join(f"wd:{q}" for q in batch)
        res = http.post(SPARQL, data={"query": query_tmpl % values, "format": "json"},
                        headers={"Accept": "application/sparql-results+json"})
        for b in res["results"]["bindings"]:
            v = lambda k: b.get(k, {}).get("value")  # noqa: E731
            qid = v("item").rsplit("/", 1)[-1]
            split = lambda k: [x.rsplit("/", 1)[-1] for x in (v(k) or "").split("|") if x]  # noqa: E731
            d = out.setdefault(qid, {"qid": qid, "sitelinks": 0, "en_title": None,
                                     "ko_title": None, "ko_label": None, "product": False,
                                     "instance_of": [], "subclass_of": [], "origins": []})
            d["sitelinks"] = max(d["sitelinks"], int(v("sl") or 0))
            d["en_title"] = d["en_title"] or v("enTitle")
            d["ko_title"] = d["ko_title"] or v("koTitle")
            d["ko_label"] = d["ko_label"] or v("koLabel")
            d["product"] |= bool(v("mfr"))
            for key, field in (("inst", "instance_of"), ("sup", "subclass_of"), ("origins", "origins")):
                d[field] = sorted(set(d[field]) | set(split(key)))
        if i % 5 == 4:
            print(f"  · 상세 {min((i + 1) * 200, len(qids))}/{len(qids)}")
    return out


def subclasses(http: Http, root: str) -> set[str]:
    res = http.post(SPARQL, data={"query": f"SELECT ?c WHERE {{ ?c wdt:P279* wd:{root} }}", "format": "json"},
                    headers={"Accept": "application/sparql-results+json"})
    return {b["c"]["value"].rsplit("/", 1)[-1] for b in res["results"]["bindings"]}


def strip_paren(title: str) -> str:
    return re.sub(r"\s*\([^)]*\)$", "", title).strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="dish_targets.csv 에 새 후보를 병합한다")
    ap.add_argument("--max-resolve", type=int, default=0, help="Wikidata 검색 수 제한 (0=무제한)")
    ap.add_argument("--min-sitelinks", type=int, default=3, help="이보다 언어판이 적은 문서는 후보에서 뺀다")
    ap.add_argument("--skip-ingredients", action="store_true", help="재료 사이트맵은 건너뛴다")
    ap.add_argument("--no-search", action="store_true", help="검색 매칭 건너뛰기 (직접 제목 매칭만)")
    ap.add_argument("--allow-unknown-origin", action="store_true", help="원산지 불명도 포함")
    args = ap.parse_args()

    http = Http(min_interval=1.5)
    countries = {r["code"] for r in read_csv(SEED / "countries.csv")}
    targets = read_csv(SEED / "dish_targets.csv")
    taken_slugs = {t["slug"] for t in targets}
    taken_titles = {t["wiki_en_title"].lower() for t in targets}
    taken_en_names = {t["name_en"].lower() for t in targets}
    names_ko = {}
    if (SEED / "dish_names_ko.csv").exists():
        names_ko = {r["wiki_en_title"]: r["name_ko"] for r in read_csv(SEED / "dish_names_ko.csv")}

    # ── 1. 사이트맵에서 slug 추출 ──
    print("① TasteAtlas 사이트맵 파싱")
    cached = RAW / "tasteatlas_slugs.json"
    if cached.exists():
        all_items = read_json(cached)
        print(f"  캐시 사용: {len(all_items)}개")
    else:
        all_items = []
        for smap in ["dishes.xml"] + ([] if args.skip_ingredients else ["ingredients.xml"]):
            url = f"{SITEMAP_BASE}/{smap}"
            print(f"  {smap} 다운로드 중…")
            items = parse_sitemap(http, url)
            for it in items:
                it["source"] = smap.replace(".xml", "")
            all_items.extend(items)
            print(f"  → {len(items)}개")
        write_json(cached, all_items)
    print(f"  전체: {len(all_items)}개 (dishes + ingredients)")

    # ── 2. 기존 타겟과 중복 제거 ──
    print("② 기존 타겟과 중복 제거")
    novel = []
    dup = 0
    for it in all_items:
        ta_slug = it["slug"]
        name = it["caption"] or slug_to_search_name(ta_slug)
        name_lower = name.lower()
        our_slug = slugify(name)
        if our_slug in taken_slugs or ta_slug in taken_slugs or name_lower in taken_titles or name_lower in taken_en_names:
            dup += 1
            continue
        novel.append({**it, "search_name": name})
    print(f"  중복: {dup}개, 새 후보: {len(novel)}개")

    if args.max_resolve > 0:
        novel = novel[:args.max_resolve]
        print(f"  제한 적용: {len(novel)}개만 검색")

    # ── 3. Wikidata 에서 QID 매칭 ──
    print("③ Wikidata 검색으로 QID 매칭")
    search_names = [it["search_name"] for it in novel]
    direct = resolve_via_wikidata(http, search_names)
    matched = 0
    for it in novel:
        key = it["search_name"].lower()
        if key in direct:
            it["wiki"] = direct[key]
            matched += 1
    print(f"  매칭: {matched}/{len(novel)}개")

    # QID 가 있는 것만 남기기
    with_qid = [it for it in novel if it.get("wiki")]
    # 이미 타겟에 있는 QID 제거
    wd_prev = read_json(RAW / "wikidata.json", {}) or {}
    taken_qids = {d["qid"] for d in wd_prev.values() if d.get("qid")}
    with_qid = [it for it in with_qid if it["wiki"]["qid"] not in taken_qids]
    # QID 중복 제거 (TasteAtlas 에서 같은 음식이 다른 slug 으로 있을 수 있음)
    seen_qids: set[str] = set()
    deduped = []
    for it in with_qid:
        qid = it["wiki"]["qid"]
        if qid not in seen_qids:
            seen_qids.add(qid)
            deduped.append(it)
    with_qid = deduped
    print(f"  QID 매칭 + 중복 제거 후: {len(with_qid)}개")

    if not with_qid:
        print("새 후보 없음")
        return

    # ── 4. Wikidata 상세 정보 (음식 분류·나라·한국어 이름) ──
    print("④ Wikidata 상세 조회")
    all_qids = [it["wiki"]["qid"] for it in with_qid]
    food_set = subclasses(http, FOOD)
    excluded = {q: why for root, why in EXCLUDE_ROOTS.items() for q in subclasses(http, root)}
    wd = wikidata_details(http, all_qids)

    # ── 5. 필터링 ──
    print("⑤ 필터링 (음식 여부·술·상표·원산지)")
    reasons: Counter = Counter()
    candidates = []
    for it in with_qid:
        qid = it["wiki"]["qid"]
        d = wd.get(qid)
        if not d:
            reasons["Wikidata 정보 없음"] += 1
            continue
        classes = set(d["instance_of"]) | set(d["subclass_of"]) | {qid}
        if not (qid in food_set or set(d["instance_of"]) & food_set):
            reasons["음식 아님"] += 1
            continue
        bad = False
        for c in classes:
            if c in excluded:
                reasons[excluded[c]] += 1
                bad = True
                break
        if bad:
            continue
        for c in d["instance_of"]:
            if c in EXCLUDE_INSTANCE:
                reasons[EXCLUDE_INSTANCE[c]] += 1
                bad = True
                break
        if bad:
            continue
        if d["product"]:
            reasons["상품(제조사 있음)"] += 1
            continue
        if d["sitelinks"] < args.min_sitelinks:
            reasons["언어판 적음"] += 1
            continue
        origins = [o for o in d["origins"] if o in countries]
        if d["origins"] and not origins:
            reasons["원산지가 목록 밖"] += 1
            continue
        if not origins:
            reasons["원산지 불명"] += 1
            continue
        candidates.append({
            "ta_slug": it["slug"],
            "source": it["source"],
            "search_name": it["search_name"],
            "qid": qid,
            "en_title": d["en_title"] or it["wiki"]["title"],
            "ko_name": d["ko_title"] or d["ko_label"] or "",
            "origins": origins,
            "sitelinks": d["sitelinks"],
        })
    print(f"  통과: {len(candidates)}개")
    if reasons:
        print("  제외: " + " · ".join(f"{k} {n}" for k, n in reasons.most_common()))

    # ── 6. 결과 저장 ──
    print("⑥ 결과 저장")
    # 나라별 분배 + 최종 중복 체크
    final: list[dict] = []
    final_slugs: set[str] = set(taken_slugs)
    final_titles: set[str] = set(taken_titles)
    candidates.sort(key=lambda c: -c["sitelinks"])
    for c in candidates:
        en_name = strip_paren(c["en_title"])
        if en_name.lower() in final_titles:
            continue
        slug = slugify(en_name) or c["qid"].lower()
        if slug in final_slugs:
            slug = f"{slug}-{c['origins'][0].lower()}"
        if slug in final_slugs:
            continue
        cc = min(c["origins"], key=lambda o: sum(1 for f in final if f["country_code"] == o))
        final_slugs.add(slug)
        final_titles.add(en_name.lower())
        ko_name = names_ko.get(c["en_title"]) or strip_paren(c["ko_name"])
        final.append({
            "slug": slug,
            "name_ko": ko_name,
            "name_en": en_name,
            "country_code": cc,
            "wiki_en_title": c["en_title"],
            "origin_note": f"{AUTO_NOTE} ({TA_NOTE}, 언어판 {c['sitelinks']})",
            "demo_required": "",
            "_qid": c["qid"],
            "_ta_slug": c["ta_slug"],
            "_source": c["source"],
        })
    print(f"  최종 후보: {len(final)}개")

    # 나라별 분포
    by_cc = Counter(f["country_code"] for f in final)
    for cc, n in by_cc.most_common(20):
        print(f"  {cc}: +{n}")
    if len(by_cc) > 20:
        print(f"  … 외 {len(by_cc) - 20}개국")

    # 저장
    write_json(RAW / "tasteatlas_candidates.json", final)
    print(f"  → data/raw/tasteatlas_candidates.json ({len(final)}건)")

    no_ko = sum(1 for f in final if not f["name_ko"])
    if no_ko:
        print(f"  ⚠ 한국어 이름 없음 {no_ko}건 → s05_llm_draft 에서 채워진다")

    if args.apply:
        print("⑦ dish_targets.csv 에 병합")
        rows_out = list(targets)
        for f in final:
            rows_out.append({k: f[k] for k in TARGET_FIELDS})
        with open(SEED / "dish_targets.csv", "w", encoding="utf-8", newline="") as fp:
            w = csv.DictWriter(fp, fieldnames=TARGET_FIELDS, lineterminator="\n", extrasaction="ignore")
            w.writeheader()
            w.writerows(rows_out)
        print(f"  ✔ dish_targets.csv {len(rows_out)}행 (기존 {len(targets)} + 신규 {len(final)})")


if __name__ == "__main__":
    main()
