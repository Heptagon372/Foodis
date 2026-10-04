"""⑧b AI 초안 없이 기본 정보만 Supabase 에 적재 (s05~s07 전에 앱을 실제 DB 로 띄우는 용도).

넣는 것: 이름(ko/en) · 나라 · 사진(작가·라이선스) · 한 줄 설명(Wikidata 설명, CC0) · 위키 링크 · QID
빼는 것: 위키 제목 검색으로 대체된 음식(needs_review — 다른 음식 문서일 수 있음), 나라를 못 정한 음식
식이 정보는 전부 unknown. verified=true 로 넣어 앱에 보이게 하되 verified_at 은 비워 사람 검수분과 구분한다.
나중에 s07 import → s08 을 돌리면 같은 slug 로 덮어쓴다.

  python scripts/s08b_load_basic.py --dry-run
  python scripts/s08b_load_basic.py --env ../../foodis-data/.env
"""
from __future__ import annotations

import argparse
import re
from collections import Counter
from pathlib import Path

import s08_load
from common import RAW, SEED, load_env, read_csv, read_json

AUTO_NOTE = "기본 정보 자동 적재 (AI 초안·사람 검수 전)"


def credit(img: dict) -> str:
    return f"{img.get('artist') or '작자 미상'} / {img.get('license') or '라이선스 확인 필요'} / {img.get('page') or ''}"


def build(targets: list[dict], countries: set[str], wd: dict, wp: dict) -> tuple[list[dict], list[dict], Counter]:
    foods, srcs, skipped = [], [], Counter()
    seen_qids: set[str] = set()
    for t in targets:
        s = t["slug"]
        d, w = wd.get(s), wp.get(s) or {}
        if not d:
            skipped["위키 문서 없음"] += 1
            continue
        if d.get("needs_review"):
            skipped["검색 대체 문서(검수 필요)"] += 1
            continue
        if "Wikimedia disambiguation page" in d.get("instance_of", []):
            skipped["동음이의어 문서"] += 1
            continue
        cc = t["country_code"] if t["country_code"] in countries else next((o for o in d.get("origin_codes", []) if o in countries), None)
        if not cc:
            skipped["나라 미정"] += 1
            continue
        qid = d.get("qid")
        if qid in seen_qids:
            skipped["같은 QID 중복"] += 1
            continue
        seen_qids.add(qid)
        en, ko, img = w.get("en") or {}, w.get("ko") or {}, w.get("image") or {}
        name_ko = t.get("name_ko") or re.sub(r"\s*\([^)]*\)$", "", d.get("ko_title") or "") or d.get("label_ko") or t["name_en"]
        foods.append({
            "slug": s, "name_ko": name_ko, "name_en": t["name_en"], "country_code": cc,
            "origin_note": None if (t.get("origin_note") or "").startswith("자동 후보") else (t.get("origin_note") or None),
            "summary": ko.get("description") or en.get("description"),
            "image_url": img.get("url"), "image_credit": credit(img) if img else None,
            "wikidata_qid": qid, "wikipedia_en": en.get("url"), "wikipedia_ko": ko.get("url"),
            "diet_note": AUTO_NOTE, "verified": True, "verified_at": None,
        })

        def src(field, url, title, data_source_id, license_):
            srcs.append({"food_slug": s, "field": field, "url": url, "title": title,
                         "source_type": data_source_id, "license": license_, "data_source_id": data_source_id})
        for lang, x in (("en", en), ("ko", ko)):
            if x.get("url"):
                src("wiki_link", x["url"], f"Wikipedia ({lang})", "wikipedia", "CC BY-SA 4.0")
        if qid:
            src("name,origin,summary", f"https://www.wikidata.org/wiki/{qid}", "Wikidata", "wikidata", "CC0")
        if img.get("page"):
            ov = img.get("source") == "openverse"
            src("image", img["page"], "Openverse" if ov else "Wikimedia Commons",
                "openverse" if ov else "wikimedia_commons", img.get("license"))
    return foods, srcs, skipped


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--env", type=Path, help="SUPABASE_* 가 든 .env 경로 (기본: foodis-data/.env)")
    args = ap.parse_args()
    if args.env:
        load_env(args.env)
    s08_load.DRY = args.dry_run

    countries = read_csv(SEED / "countries.csv")
    foods, srcs, skipped = build(read_csv(SEED / "dish_targets.csv"), {c["code"] for c in countries},
                                 read_json(RAW / "wikidata.json", {}), read_json(RAW / "wikipedia.json", {}))
    print(f"적재 대상 {len(foods)}개 · 건너뜀 " + " · ".join(f"{k} {n}" for k, n in skipped.most_common()))
    print(f"  한국어 이름 {sum(1 for f in foods if f['name_ko'] != f['name_en'])} · 사진 {sum(1 for f in foods if f['image_url'])}"
          f" · 한 줄 설명 {sum(1 for f in foods if f['summary'])} · 나라 {len({f['country_code'] for f in foods})}개국")

    rest = s08_load.Rest()
    rest.upsert("data_sources", s08_load.read_csv_policy(), "id")
    rest.upsert("countries", countries, "code")
    food_ids = {r["slug"]: r["id"] for r in rest.upsert("foods", foods, "slug")}
    rest.upsert("sources", [{k: v for k, v in {**x, "food_id": food_ids[x["food_slug"]]}.items() if k != "food_slug"}
                            for x in srcs if x["food_slug"] in food_ids], "food_id,field,url")
    print("✔ 기본 정보 적재 완료" + (" (dry-run)" if args.dry_run else ""))


if __name__ == "__main__":
    main()
