"""⓪ 음식 목표 리스트 확장: 나라별 영어 위키백과 「○○ cuisine」 분류 + Wikidata 로 후보를 모아 dish_targets.csv 에 덧붙인다.

입력: data/seed/countries.csv, data/seed/dish_targets.csv (사람이 고른 기존 목표는 그대로 둔다)
출력: data/seed/dish_targets.csv (자동 후보 행 추가), data/raw/expand_report.json (후보별 근거·순위)

고르는 법:
  1) PetScan 으로 나라별 요리 분류(깊이 2)의 문서 → Wikidata QID
  2) Wikidata 에서 '음식(Q2095)의 하위 분류'인 것만 남긴다. 술(Q154 계열)·상표·제조사 있는 상품·품종·채소·과일 원물은 뺀다
  3) 나라 배정: Wikidata 원산지(P495)가 우리 150개국 안이면 그 나라. 원산지가 우리 목록 밖이면 버린다.
     원산지가 없으면 그 문서가 한 나라의 요리 분류에만 있을 때만 (여러 나라 분류에 걸친 건 어느 나라 것인지 몰라 제외).
     원산지가 여러 나라면 후보가 적은 나라에 준다
  4) 위키백과 언어판 수(sitelinks)로 유명한 순서를 매기고, 나라별 몫 = min(가용, k·√가용) 의 k 를 올려 전체 목표 수에 맞춘다
  5) 원산지(P495)로 잡힌 음식을 먼저, 분류로만 잡힌 음식(초콜릿 케이크 같은 일반 음식이 섞인다)은 남는 자리에
자동 후보는 origin_note 가 "자동 후보" 로 시작한다 → 초안·검수 단계에서 그대로 걸러 볼 수 있다.
사람이 고친 것은 시드에 남겨 다시 돌려도 유지된다:
  data/seed/dish_excludes.csv  (wiki_en_title, country_code, reason) — 음식이 아니거나 나라 대표로 보기 어려운 후보.
                               country_code 가 있으면 그 나라 배정만 막는다 ("다른 나라 음식")
  data/seed/dish_names_ko.csv  (wiki_en_title, name_ko) — 한국어 이름 (위키백과 한국어 문서 제목보다 우선)

  python scripts/s00_expand_targets.py --total 2100           # 전체 목표 수 (기존 포함)
  python scripts/s00_expand_targets.py --total 2100 --dry-run # 파일은 안 쓰고 나라별 수만
"""
from __future__ import annotations

import argparse
import csv
import math
import re
from collections import Counter, defaultdict

from common import RAW, SEED, Http, chunks, read_csv, read_json, slugify, write_json

PETSCAN = "https://petscan.wmcloud.org/"
SPARQL = "https://query.wikidata.org/sparql"
WIKI_API = "https://en.wikipedia.org/w/api.php"
AUTO_NOTE = "자동 후보"

# 나라 → 영어 위키백과 요리 분류 (Category:Cuisine by country 의 하위 분류 이름)
CUISINE_CATEGORY = {
    "KR": "Korean cuisine", "KP": "North Korean cuisine", "JP": "Japanese cuisine", "CN": "Chinese cuisine",
    "TW": "Taiwanese cuisine", "MN": "Mongolian cuisine", "TH": "Thai cuisine", "VN": "Vietnamese cuisine",
    "ID": "Indonesian cuisine", "PH": "Filipino cuisine", "MY": "Malaysian cuisine", "SG": "Singaporean cuisine",
    "KH": "Cambodian cuisine", "LA": "Lao cuisine", "MM": "Burmese cuisine", "BN": "Bruneian cuisine",
    "IN": "Indian cuisine", "NP": "Nepalese cuisine", "PK": "Pakistani cuisine", "BD": "Bangladeshi cuisine",
    "LK": "Sri Lankan cuisine", "BT": "Bhutanese cuisine", "MV": "Maldivian cuisine", "AF": "Afghan cuisine",
    "UZ": "Uzbekistani cuisine", "KZ": "Kazakh cuisine", "KG": "Kyrgyz cuisine", "TJ": "Tajik cuisine",
    "TM": "Turkmen cuisine",
    "IT": "Italian cuisine", "FR": "French cuisine", "ES": "Spanish cuisine", "GR": "Greek cuisine",
    "AT": "Austrian cuisine", "PL": "Polish cuisine", "GE": "Georgian cuisine", "AM": "Armenian cuisine",
    "AZ": "Azerbaijani cuisine", "GB": "British cuisine", "IE": "Irish cuisine", "PT": "Portuguese cuisine",
    "DE": "German cuisine", "NL": "Dutch cuisine", "BE": "Belgian cuisine", "CH": "Swiss cuisine",
    "SE": "Swedish cuisine", "NO": "Norwegian cuisine", "DK": "Danish cuisine", "FI": "Finnish cuisine",
    "IS": "Icelandic cuisine", "CZ": "Czech cuisine", "SK": "Slovak cuisine", "HU": "Hungarian cuisine",
    "RO": "Romanian cuisine", "BG": "Bulgarian cuisine", "UA": "Ukrainian cuisine", "RU": "Russian cuisine",
    "LT": "Lithuanian cuisine", "LV": "Latvian cuisine", "EE": "Estonian cuisine", "RS": "Serbian cuisine",
    "HR": "Croatian cuisine", "BA": "Bosnia and Herzegovina cuisine", "AL": "Albanian cuisine",
    "CY": "Cypriot cuisine", "MT": "Maltese cuisine", "SI": "Slovenian cuisine", "MK": "Macedonian cuisine",
    "ME": "Montenegrin cuisine", "MD": "Moldovan cuisine", "BY": "Belarusian cuisine", "LU": "Cuisine of Luxembourg",
    "TR": "Turkish cuisine", "LB": "Lebanese cuisine", "IR": "Iranian cuisine", "IL": "Israeli cuisine",
    "JO": "Jordanian cuisine", "SA": "Saudi Arabian cuisine", "AE": "Emirati cuisine", "IQ": "Iraqi cuisine",
    "SY": "Syrian cuisine", "YE": "Yemeni cuisine", "OM": "Omani cuisine", "KW": "Kuwaiti cuisine",
    "QA": "Qatari cuisine", "BH": "Bahraini cuisine",
    "EG": "Egyptian cuisine", "MA": "Moroccan cuisine", "TN": "Tunisian cuisine", "DZ": "Algerian cuisine",
    "LY": "Libyan cuisine", "SD": "Sudanese cuisine", "ET": "Ethiopian cuisine", "ER": "Eritrean cuisine",
    "SO": "Somali cuisine", "KE": "Kenyan cuisine", "TZ": "Tanzanian cuisine", "UG": "Ugandan cuisine",
    "RW": "Rwandan cuisine", "NG": "Nigerian cuisine", "GH": "Ghanaian cuisine", "SN": "Senegalese cuisine",
    "CI": "Ivorian cuisine", "ML": "Malian cuisine", "BJ": "Beninese cuisine", "CV": "Cape Verdean cuisine",
    "CM": "Cameroonian cuisine", "CD": "Democratic Republic of the Congo cuisine", "AO": "Angolan cuisine",
    "MZ": "Mozambican cuisine", "ZW": "Zimbabwean cuisine", "ZM": "Zambian cuisine", "MW": "Malawian cuisine",
    "ZA": "South African cuisine", "MG": "Malagasy cuisine", "MU": "Mauritian cuisine",
    "US": "American cuisine", "CA": "Canadian cuisine", "MX": "Mexican cuisine", "GT": "Guatemalan cuisine",
    "SV": "Salvadoran cuisine", "HN": "Honduran cuisine", "NI": "Nicaraguan cuisine", "CR": "Costa Rican cuisine",
    "PA": "Panamanian cuisine", "BZ": "Belizean cuisine", "CU": "Cuban cuisine", "JM": "Jamaican cuisine",
    "DO": "Dominican Republic cuisine", "HT": "Haitian cuisine", "TT": "Trinidad and Tobago cuisine",
    "BB": "Barbadian cuisine", "CO": "Colombian cuisine", "VE": "Venezuelan cuisine", "EC": "Ecuadorian cuisine",
    "PE": "Peruvian cuisine", "BO": "Bolivian cuisine", "BR": "Brazilian cuisine", "AR": "Argentine cuisine",
    "CL": "Chilean cuisine", "UY": "Uruguayan cuisine", "PY": "Paraguayan cuisine", "GY": "Guyanese cuisine",
    "SR": "Surinamese cuisine",
    "AU": "Australian cuisine", "NZ": "New Zealand cuisine", "FJ": "Fijian cuisine", "PG": "Papua New Guinean cuisine",
    "WS": "Samoan cuisine", "TO": "Tongan cuisine",
}

FOOD = "Q2095"
# 음식의 하위 분류지만 서비스 목표(나라를 대표하는 음식)와 거리가 먼 것: 술 · 채소/과일/곡물 원물
EXCLUDE_ROOTS = {"Q154": "술", "Q11004": "채소", "Q3314483": "과일", "Q12117": "곡물"}
# 상품·품종 (P31 값으로 판정)
EXCLUDE_INSTANCE = {"Q431289": "상표", "Q167270": "상표", "Q2424752": "상품", "Q4886": "품종", "Q16521": "분류군"}
# 나라별 음식 수 범위: 최소 5개(후보가 되는 만큼), 최대 100개
MIN_PER_COUNTRY = 5
MAX_PER_COUNTRY = 100
TITLE_SKIP = re.compile(r"^(List of|Lists of|Outline of|Index of)|cuisine|Cuisine|restaurant|Restaurant|\bchef\b", re.I)


def subclasses(http: Http, root: str) -> set[str]:
    res = http.post(SPARQL, data={"query": f"SELECT ?c WHERE {{ ?c wdt:P279* wd:{root} }}", "format": "json"},
                    headers={"Accept": "application/sparql-results+json"})
    return {b["c"]["value"].rsplit("/", 1)[-1] for b in res["results"]["bindings"]}


def existing_categories(http: Http, titles: list[str]) -> set[str]:
    ok: set[str] = set()
    for batch in chunks(titles, 50):
        r = http.get(WIKI_API, params={"action": "query", "format": "json", "formatversion": 2,
                                       "titles": "|".join(f"Category:{t}" for t in batch)})
        ok |= {p["title"].removeprefix("Category:") for p in r["query"]["pages"] if not p.get("missing")}
    return ok


def category_pages(http: Http, category: str, depth: int) -> dict[str, str]:
    """PetScan: 분류(깊이 depth)의 본문 문서 → {QID: 영어 제목}"""
    r = http.get(PETSCAN, params={"language": "en", "project": "wikipedia", "categories": category.replace(" ", "_"),
                                  "depth": depth, "ns[0]": 1, "format": "json", "doit": 1, "wikidata_item": "with"})
    pages = r["*"][0]["a"]["*"]
    return {p["q"]: p["title"].replace("_", " ") for p in pages if p.get("q")}


DETAIL_TMPL = """
SELECT ?item ?sl ?enTitle ?koTitle ?koLabel ?mfr
       (GROUP_CONCAT(DISTINCT ?p31; separator="|") AS ?inst)
       (GROUP_CONCAT(DISTINCT ?p279; separator="|") AS ?sup)
       (GROUP_CONCAT(DISTINCT ?origin; separator="|") AS ?origins)
WHERE {
  VALUES ?item { %s }
  ?item wikibase:sitelinks ?sl .
  ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?enTitle .
  OPTIONAL { ?item wdt:P31 ?p31 }
  OPTIONAL { ?item wdt:P279 ?p279 }
  OPTIONAL { ?item wdt:P495/wdt:P297 ?origin }
  OPTIONAL { ?item wdt:P176 ?mfr }
  OPTIONAL { ?ko schema:about ?item ; schema:isPartOf <https://ko.wikipedia.org/> ; schema:name ?koTitle . }
  OPTIONAL { ?item rdfs:label ?koLabel FILTER(LANG(?koLabel) = "ko") }
}
GROUP BY ?item ?sl ?enTitle ?koTitle ?koLabel ?mfr
"""


def details(http: Http, qids: list[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for i, batch in enumerate(chunks(sorted(qids), 200)):
        res = http.post(SPARQL, data={"query": DETAIL_TMPL % " ".join(f"wd:{q}" for q in batch), "format": "json"},
                        headers={"Accept": "application/sparql-results+json"})
        for b in res["results"]["bindings"]:
            v = lambda k: b.get(k, {}).get("value")  # noqa: E731
            qid = v("item").rsplit("/", 1)[-1]
            split = lambda k: [x.rsplit("/", 1)[-1] for x in (v(k) or "").split("|") if x]  # noqa: E731
            d = out.setdefault(qid, {"qid": qid, "sitelinks": int(v("sl")), "en_title": v("enTitle"),
                                     "ko_title": v("koTitle"), "ko_label": v("koLabel"), "product": False,
                                     "instance_of": [], "subclass_of": [], "origins": []})
            d["product"] |= bool(v("mfr"))
            for key, field in (("inst", "instance_of"), ("sup", "subclass_of"), ("origins", "origins")):
                d[field] = sorted(set(d[field]) | set(split(key)))
        if i % 10 == 9:
            print(f"  · 상세 {min((i + 1) * 200, len(qids))}/{len(qids)}")
    return out


TARGET_FIELDS = ["slug", "name_ko", "name_en", "country_code", "wiki_en_title", "origin_note", "demo_required"]


def write_targets(rows: list[dict]) -> None:
    """시드 CSV 는 손으로도 고치는 파일이라 원래 모양(BOM 없음 · LF)을 지킨다"""
    with open(SEED / "dish_targets.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=TARGET_FIELDS, lineterminator="\n", extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def strip_paren(title: str) -> str:
    return re.sub(r"\s*\([^)]*\)$", "", title).strip()


def allocate(by_country: dict[str, list[dict]], existing: Counter, total: int) -> tuple[float, dict[str, list[dict]]]:
    """나라별 몫 = min(가용, k·√가용) — 최소 MIN_PER_COUNTRY(가용이 되는 만큼), 최대 MAX_PER_COUNTRY — 요리가 풍부한 나라는 더 많이, 작은 나라는 있는 만큼 다.
    (기존 + 새로) 합이 total 에 닿는 가장 작은 k 를 찾는다."""
    def picked(k: float) -> dict[str, list[dict]]:
        out = {}
        for cc, rows in by_country.items():
            pool = existing[cc] + len(rows)
            quota = max(existing[cc], math.ceil(k * math.sqrt(pool)), MIN_PER_COUNTRY)
            quota = min(pool, max(existing[cc], min(quota, MAX_PER_COUNTRY)))
            out[cc] = rows[:max(0, quota - existing[cc])]
        return out
    k = 0.5
    while k < 50:
        sel = picked(k)
        if sum(existing.values()) + sum(len(v) for v in sel.values()) >= total:
            return k, sel
        k += 0.05
    return k, picked(k)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--total", type=int, default=2100, help="기존 목표를 포함한 전체 음식 수")
    ap.add_argument("--depth", type=int, default=2, help="요리 분류 탐색 깊이")
    ap.add_argument("--min-sitelinks", type=int, default=2, help="이보다 언어판이 적은 문서는 후보에서 뺀다")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    http = Http(min_interval=0.5)
    countries = {r["code"] for r in read_csv(SEED / "countries.csv")}
    targets = read_csv(SEED / "dish_targets.csv")
    manual = [t for t in targets if not t["origin_note"].startswith(AUTO_NOTE)]  # 다시 돌려도 자동 후보만 갈아 끼운다
    existing = Counter(t["country_code"] for t in manual)
    taken_slugs = {t["slug"] for t in manual}
    taken_titles = {t["wiki_en_title"].lower() for t in manual}
    # 사람이 고른 목표의 QID 만 (wikidata.json 에는 지난번 자동 후보도 들어 있어서 통째로 쓰면 자동 후보가 전부 빠진다)
    wd_prev = read_json(RAW / "wikidata.json", {}) or {}
    taken_qids = {wd_prev[t["slug"]]["qid"] for t in manual if wd_prev.get(t["slug"], {}).get("qid")}
    ex_rows = read_csv(SEED / "dish_excludes.csv") if (SEED / "dish_excludes.csv").exists() else []
    excludes = {r["wiki_en_title"]: r["reason"] for r in ex_rows if not r.get("country_code")}
    not_here = {(r["wiki_en_title"], r["country_code"]) for r in ex_rows if r.get("country_code")}
    names_ko = {r["wiki_en_title"]: r["name_ko"] for r in read_csv(SEED / "dish_names_ko.csv")} if (SEED / "dish_names_ko.csv").exists() else {}

    missing_map = sorted(countries - set(CUISINE_CATEGORY))
    if missing_map:
        raise SystemExit(f"CUISINE_CATEGORY 에 없는 나라: {', '.join(missing_map)}")
    cats = {cc: CUISINE_CATEGORY[cc] for cc in sorted(countries)}
    found = existing_categories(http, sorted(set(cats.values())))
    for cc, cat in cats.items():
        if cat not in found:
            print(f"  ⚠ {cc}: 분류 'Category:{cat}' 없음 → 원산지(P495)로만 후보를 받는다")

    print("① 요리 분류 문서 수집 (PetScan)")
    member_of: dict[str, set[str]] = defaultdict(set)
    titles: dict[str, str] = {}
    for cc, cat in cats.items():
        if cat not in found:
            continue
        pages = category_pages(http, cat, args.depth)
        for q, t in pages.items():
            if TITLE_SKIP.search(t):
                continue
            member_of[q].add(cc)
            titles[q] = t
    print(f"  {len(member_of)}개 문서")

    print("② Wikidata 분류 · 원산지 · 언어판 수")
    food = subclasses(http, FOOD)
    excluded = {q: why for root, why in EXCLUDE_ROOTS.items() for q in subclasses(http, root)}
    info = details(http, list(member_of))

    def reject(d: dict) -> str | None:
        classes = set(d["instance_of"]) | set(d["subclass_of"]) | {d["qid"]}
        if not (d["qid"] in food or set(d["instance_of"]) & food):
            return "음식 아님"
        for c in classes:
            if c in excluded:
                return excluded[c]
        for c in d["instance_of"]:
            if c in EXCLUDE_INSTANCE:
                return EXCLUDE_INSTANCE[c]
        if d["product"]:
            return "상품(제조사 있음)"
        if d["sitelinks"] < args.min_sitelinks:
            return "언어판 적음"
        if d["qid"] in taken_qids or d["en_title"].lower() in taken_titles:
            return "이미 목표에 있음"
        if d["en_title"] in excludes:
            return "검수 제외"
        return None

    reasons: Counter = Counter()
    homes: dict[str, tuple[list[str], str]] = {}  # QID → (배정 가능한 나라들, 근거)
    for q, d in info.items():
        why = reject(d)
        if not why:
            origins = [o for o in d["origins"] if o in countries]
            if d["origins"] and not origins:
                why = "원산지가 목록 밖"
            elif origins:
                homes[q] = ([o for o in origins if o in member_of[q]] or origins, "P495")
            elif len(member_of[q]) == 1:
                homes[q] = (sorted(member_of[q]), "category")
            else:
                why = f"분류 {len(member_of[q])}개에 걸침"
            if q in homes:
                ccs = [cc for cc in homes[q][0] if (d["en_title"], cc) not in not_here]
                if ccs:
                    homes[q] = (ccs, homes[q][1])
                else:
                    del homes[q]
                    why = "검수 제외 (다른 나라 음식)"
        if why:
            reasons[why] += 1
    # 여러 나라에 걸친 음식(걸프 지역 마치부스 등)은 후보가 적은 나라에 준다 → 작은 나라도 대표 음식을 갖게
    pool_size = Counter(cc for ccs, _ in homes.values() for cc in ccs)
    by_country: dict[str, list[dict]] = defaultdict(list)
    for q, (ccs, how) in homes.items():
        home = min(ccs, key=lambda cc: (existing[cc] + pool_size[cc], cc))
        by_country[home].append({**info[q], "how": how})
    for rows in by_country.values():
        rows.sort(key=lambda d: (d["how"] != "P495", -d["sitelinks"], d["en_title"]))
    print("  제외: " + " · ".join(f"{k} {n}" for k, n in reasons.most_common()))

    cap, sel = allocate(by_country, existing, args.total)
    added = sum(len(v) for v in sel.values())
    print(f"③ 나라별 몫 = min(가용, {cap:.2f}·√가용) → 새 후보 {added}건 (기존 {len(manual)} + {added} = {len(manual) + added})")
    for cc in sorted(countries, key=lambda c: -(existing[c] + len(sel.get(c, [])))):
        n_new = len(sel.get(cc, []))
        print(f"  {cc}: {existing[cc] + n_new} (기존 {existing[cc]} + {n_new} / 가용 {len(by_country.get(cc, []))})")

    rows_out = list(manual)
    report = []
    for cc in sorted(sel):
        for d in sel[cc]:
            name_en = strip_paren(d["en_title"])
            slug = slugify(name_en) or d["qid"].lower()
            if slug in taken_slugs:
                slug = f"{slug}-{cc.lower()}"
            if slug in taken_slugs:
                slug = f"{slug}-{d['qid'].lower()}"
            taken_slugs.add(slug)
            name_ko = names_ko.get(d["en_title"]) or strip_paren(d["ko_title"] or d["ko_label"] or "")
            via = "원산지 P495" if d["how"] == "P495" else f"분류 {CUISINE_CATEGORY[cc]}"
            rows_out.append({"slug": slug, "name_ko": name_ko, "name_en": name_en, "country_code": cc,
                             "wiki_en_title": d["en_title"], "origin_note": f"{AUTO_NOTE} ({via}, 언어판 {d['sitelinks']})",
                             "demo_required": ""})
            report.append({"slug": slug, "qid": d["qid"], "country": cc, "how": d["how"], "sitelinks": d["sitelinks"],
                           "name_ko_from": "seed" if d["en_title"] in names_ko else "kowiki" if d["ko_title"] else ("label" if d["ko_label"] else None),
                           "categories": sorted(member_of[d["qid"]])})
    no_ko = sum(1 for r in report if not r["name_ko_from"])
    if no_ko:
        print(f"  ⚠ 한국어 이름 없음 {no_ko}건 → data/seed/dish_names_ko.csv 에 채운다")
    if args.dry_run:
        return
    write_targets(rows_out)
    write_json(RAW / "expand_report.json", {"k": round(cap, 2), "rejected": dict(reasons), "added": report})
    print(f"✔ data/seed/dish_targets.csv {len(rows_out)}행 · data/raw/expand_report.json")


if __name__ == "__main__":
    main()
