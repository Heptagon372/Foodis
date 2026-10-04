"""⓪c Wikidata SPARQL 직접 쿼리로 전세계 음식 대량 수집

TasteAtlas 없이 Wikidata 에서 음식 카테고리별로 직접 QID 를 수집하고
dish_targets.csv 에 병합한다.

카테고리: dish, dessert, soup, bread, pastry, snack, stew, dumpling, salad,
          noodle dish, rice dish, condiment, sauce, cheese, curry, pie, cake,
          sandwich, sausage, beverage (non-alcoholic), confectionery, porridge ...

  python scripts/s00c_wikidata_foods.py                  # 후보 발견만
  python scripts/s00c_wikidata_foods.py --apply          # dish_targets.csv 에 병합
"""
from __future__ import annotations

import argparse
import csv
import re
from collections import Counter
from pathlib import Path

from common import RAW, SEED, Http, chunks, read_csv, read_json, slugify, write_csv, write_json

SPARQL = "https://query.wikidata.org/sparql"
AUTO_NOTE = "자동 후보"
WD_NOTE = "WD 직접"

FOOD = "Q2095"
EXCLUDE_ROOTS = {"Q154": "술", "Q11004": "채소", "Q3314483": "과일", "Q12117": "곡물"}
EXCLUDE_INSTANCE = {"Q431289": "상표", "Q167270": "상표", "Q2424752": "상품", "Q4886": "품종", "Q16521": "분류군"}

TARGET_FIELDS = ["slug", "name_ko", "name_en", "country_code", "wiki_en_title", "origin_note", "demo_required"]

FOOD_CATEGORIES = [
    ("Q746549", "dish"),
    ("Q80968", "dessert"),
    ("Q41415", "soup"),
    ("Q7802", "bread"),
    ("Q477248", "pastry"),
    ("Q178359", "snack food"),
    ("Q81799", "stew"),
    ("Q1457977", "dumpling"),
    ("Q12200", "salad"),
    ("Q192619", "condiment"),
    ("Q13317", "confectionery"),
    ("Q13276", "rice dish"),
    ("Q12916", "noodle dish"),
    ("Q131419", "cheese"),
    ("Q28803", "curry"),
    ("Q13360264", "pie"),
    ("Q39546", "sandwich"),
    ("Q134856", "sausage"),
    ("Q19861951", "traditional food"),
    ("Q1778821", "cuisine"),
    ("Q1025010", "flatbread"),
    ("Q186588", "street food"),
    ("Q83453", "pudding"),
    ("Q871799", "kebab"),
    # 추가 카테고리 (전세계 문화 음식 확장)
    ("Q2095", "food (direct)"),
    ("Q185217", "prepared food"),
    ("Q1242780", "national dish"),
    ("Q1065742", "cake"),
    ("Q152", "fish dish"),
    ("Q327055", "fermented food"),
    ("Q1163715", "baked good"),
    ("Q853486", "vegetable dish"),
    ("Q324195", "noodle soup"),
    ("Q722726", "meat dish"),
    ("Q1073170", "appetizer"),
    ("Q5765377", "stir fry"),
    ("Q838948", "sushi type"),
    ("Q178275", "taco type"),
    ("Q2736612", "egg dish"),
    ("Q374814", "fruit dish"),
    ("Q4830453", "bean dish"),
    ("Q3032820", "side dish"),
    ("Q1363963", "fast food dish"),
    ("Q191067", "pizza type"),
    ("Q40050", "drink (non-alc)"),
    ("Q2512762", "barbecue"),
    ("Q12198", "breakfast food"),
    ("Q18247504", "dried food"),
    ("Q4093107", "dairy product (food)"),
    ("Q1259611", "sweet"),
    ("Q1641571", "candy"),
    ("Q223557", "waffle"),
    ("Q1854639", "crepe"),
    ("Q209476", "pancake"),
    ("Q160645", "omelette"),
    ("Q10538836", "risotto"),
]


def query_category_qids(http: Http, cat_qid: str, cat_name: str, min_sl: int = 3) -> list[str]:
    query = f"""
SELECT DISTINCT ?item WHERE {{
  ?item wdt:P31/wdt:P279* wd:{cat_qid} .
  ?item wikibase:sitelinks ?sl .
  FILTER(?sl >= {min_sl})
}}
LIMIT 5000
"""
    try:
        res = http.post(SPARQL, data={"query": query, "format": "json"},
                        headers={"Accept": "application/sparql-results+json"},
                        cache=True, timeout=120)
        qids = [b["item"]["value"].rsplit("/", 1)[-1] for b in res["results"]["bindings"]]
        print(f"  {cat_name} ({cat_qid}): {len(qids)}개")
        return qids
    except Exception as e:
        print(f"  ⚠ {cat_name} ({cat_qid}) 오류: {e}")
        return []


def wikidata_details(http: Http, qids: list[str]) -> dict[str, dict]:
    query_tmpl = """
SELECT ?item ?sl ?enTitle ?enLabel ?koTitle ?koLabel ?mfr
       (GROUP_CONCAT(DISTINCT ?p31; separator="|") AS ?inst)
       (GROUP_CONCAT(DISTINCT ?p279; separator="|") AS ?sup)
       (GROUP_CONCAT(DISTINCT ?origin; separator="|") AS ?origins)
WHERE {
  VALUES ?item { %s }
  ?item wikibase:sitelinks ?sl .
  OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?enTitle . }
  OPTIONAL { ?item rdfs:label ?enLabel FILTER(LANG(?enLabel) = "en") }
  OPTIONAL { ?item wdt:P31 ?p31 }
  OPTIONAL { ?item wdt:P279 ?p279 }
  OPTIONAL { ?item wdt:P495/wdt:P297 ?origin }
  OPTIONAL { ?item wdt:P176 ?mfr }
  OPTIONAL { ?ko schema:about ?item ; schema:isPartOf <https://ko.wikipedia.org/> ; schema:name ?koTitle . }
  OPTIONAL { ?item rdfs:label ?koLabel FILTER(LANG(?koLabel) = "ko") }
}
GROUP BY ?item ?sl ?enTitle ?enLabel ?koTitle ?koLabel ?mfr
"""
    out: dict[str, dict] = {}
    for i, batch in enumerate(chunks(sorted(qids), 200)):
        values = " ".join(f"wd:{q}" for q in batch)
        try:
            res = http.post(SPARQL, data={"query": query_tmpl % values, "format": "json"},
                            headers={"Accept": "application/sparql-results+json"},
                            cache=True, timeout=120)
            for b in res["results"]["bindings"]:
                v = lambda k: b.get(k, {}).get("value")  # noqa: E731
                qid = v("item").rsplit("/", 1)[-1]
                split = lambda k: [x.rsplit("/", 1)[-1] for x in (v(k) or "").split("|") if x]  # noqa: E731
                d = out.setdefault(qid, {"qid": qid, "sitelinks": 0, "en_title": None,
                                         "en_label": None, "ko_title": None, "ko_label": None,
                                         "product": False,
                                         "instance_of": [], "subclass_of": [], "origins": []})
                d["sitelinks"] = max(d["sitelinks"], int(v("sl") or 0))
                d["en_title"] = d["en_title"] or v("enTitle")
                d["en_label"] = d["en_label"] or v("enLabel")
                d["ko_title"] = d["ko_title"] or v("koTitle")
                d["ko_label"] = d["ko_label"] or v("koLabel")
                d["product"] |= bool(v("mfr"))
                for key, field in (("inst", "instance_of"), ("sup", "subclass_of"), ("origins", "origins")):
                    d[field] = sorted(set(d[field]) | set(split(key)))
        except Exception as e:
            print(f"  ⚠ 상세 배치 {i} 오류: {e}")
        done = min((i + 1) * 200, len(qids))
        if done % 1000 == 0 or done == len(qids):
            print(f"  · 상세 {done}/{len(qids)}")
    return out


def subclasses(http: Http, root: str) -> set[str]:
    res = http.post(SPARQL, data={"query": f"SELECT ?c WHERE {{ ?c wdt:P279* wd:{root} }}", "format": "json"},
                    headers={"Accept": "application/sparql-results+json"},
                    cache=True, timeout=120)
    return {b["c"]["value"].rsplit("/", 1)[-1] for b in res["results"]["bindings"]}


def strip_paren(title: str) -> str:
    return re.sub(r"\s*\([^)]*\)$", "", title).strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="dish_targets.csv 에 병합")
    ap.add_argument("--min-sitelinks", type=int, default=3, help="최소 언어판 수")
    ap.add_argument("--allow-unknown-origin", action="store_true", help="원산지 불명도 포함")
    args = ap.parse_args()

    http = Http(min_interval=2.0)
    countries = {r["code"] for r in read_csv(SEED / "countries.csv")}
    targets = read_csv(SEED / "dish_targets.csv")
    taken_slugs = {t["slug"] for t in targets}
    taken_titles = {t["wiki_en_title"].lower() for t in targets if t.get("wiki_en_title")}
    taken_en_names = {t["name_en"].lower() for t in targets if t.get("name_en")}
    wd_prev = read_json(RAW / "wikidata.json", {}) or {}
    taken_qids = {d["qid"] for d in wd_prev.values() if d.get("qid")}
    for t in targets:
        note = t.get("origin_note", "")
        if "Q" in note:
            import re as _re
            m = _re.search(r"Q\d+", note)
            if m:
                taken_qids.add(m.group())

    names_ko = {}
    if (SEED / "dish_names_ko.csv").exists():
        names_ko = {r["wiki_en_title"]: r["name_ko"] for r in read_csv(SEED / "dish_names_ko.csv")}

    # ── 1. Wikidata 카테고리별 QID 수집 ──
    print("① Wikidata 카테고리별 음식 QID 수집")
    cache_file = RAW / "wikidata_food_qids.json"
    if cache_file.exists():
        all_qids_list = read_json(cache_file)
        print(f"  캐시 사용: {len(all_qids_list)}개")
    else:
        all_qids: set[str] = set()
        seen_cats: set[str] = set()
        for cat_qid, cat_name in FOOD_CATEGORIES:
            if cat_qid in seen_cats:
                continue
            seen_cats.add(cat_qid)
            qids = query_category_qids(http, cat_qid, cat_name, args.min_sitelinks)
            all_qids.update(qids)
        all_qids_list = sorted(all_qids)
        write_json(cache_file, all_qids_list)
    print(f"  전체 고유 QID: {len(all_qids_list)}개")

    # ── 2. 기존 타겟과 중복 제거 ──
    print("② 기존 타겟과 QID 중복 제거")
    novel_qids = [q for q in all_qids_list if q not in taken_qids]
    print(f"  기존 QID 중복: {len(all_qids_list) - len(novel_qids)}개, 새 후보: {len(novel_qids)}개")

    if not novel_qids:
        print("새 후보 없음")
        return

    # ── 3. Wikidata 상세 정보 ──
    print("③ Wikidata 상세 조회")
    wd = wikidata_details(http, novel_qids)

    # ── 4. 필터링 ──
    print("④ 필터링 (음식 여부·술·상표·원산지)")
    food_set = subclasses(http, FOOD)
    excluded = {q: why for root, why in EXCLUDE_ROOTS.items() for q in subclasses(http, root)}
    reasons: Counter = Counter()
    candidates = []
    for qid in novel_qids:
        d = wd.get(qid)
        if not d:
            reasons["Wikidata 정보 없음"] += 1
            continue
        en_name_raw = d.get("en_title") or d.get("en_label")
        if not en_name_raw:
            reasons["영어 제목 없음"] += 1
            continue
        en_lower = en_name_raw.lower()
        if en_lower in taken_titles or en_lower in taken_en_names:
            reasons["이름 중복"] += 1
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
        origins = [o for o in d["origins"] if o in countries]
        if d["origins"] and not origins:
            reasons["원산지가 목록 밖"] += 1
            continue
        if not origins and not args.allow_unknown_origin:
            reasons["원산지 불명"] += 1
            continue
        candidates.append({
            "qid": qid,
            "en_title": en_name_raw,
            "ko_name": d["ko_title"] or d["ko_label"] or "",
            "origins": origins,
            "sitelinks": d["sitelinks"],
        })
    print(f"  통과: {len(candidates)}개")
    if reasons:
        print("  제외: " + " · ".join(f"{k} {n}" for k, n in reasons.most_common()))

    # ── 5. 결과 저장 ──
    print("⑤ 결과 저장")
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
            if c["origins"]:
                slug = f"{slug}-{c['origins'][0].lower()}"
            else:
                slug = f"{slug}-{c['qid'].lower()}"
        if slug in final_slugs:
            continue
        cc = ""
        if c["origins"]:
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
            "origin_note": f"{AUTO_NOTE} ({WD_NOTE}, 언어판 {c['sitelinks']})",
            "demo_required": "",
        })
    print(f"  최종 후보: {len(final)}개")

    by_cc = Counter(f["country_code"] for f in final)
    for cc, n in by_cc.most_common(20):
        print(f"  {cc or '(불명)'}: +{n}")
    if len(by_cc) > 20:
        print(f"  … 외 {len(by_cc) - 20}개국")

    write_json(RAW / "wikidata_food_candidates.json", final)
    print(f"  → data/raw/wikidata_food_candidates.json ({len(final)}건)")
    if final:
        ko_missing = sum(1 for f in final if not f["name_ko"])
        if ko_missing:
            print(f"  ⚠ 한국어 이름 없음 {ko_missing}건 → s05_llm_draft 에서 채워진다")

    # ── 6. dish_targets.csv 에 병합 ──
    if args.apply and final:
        print("⑥ dish_targets.csv 에 병합")
        new_rows = [{k: r.get(k, "") for k in TARGET_FIELDS} for r in final]
        all_rows = list(targets) + new_rows
        write_csv(SEED / "dish_targets.csv", all_rows, TARGET_FIELDS)
        print(f"  ✔ dish_targets.csv {len(all_rows)}행 (기존 {len(targets)} + 신규 {len(new_rows)})")
    elif not args.apply:
        print("  (--apply 없이 실행: dish_targets.csv 미변경)")


if __name__ == "__main__":
    main()
