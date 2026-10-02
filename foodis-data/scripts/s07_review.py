"""⑦ 검증 + 사람 검수 시트.

사용법
  python s07_review.py export   → 자동 검증 후 data/draft/review_sheet.csv 생성 (엑셀로 열어 검수)
  python s07_review.py import   → 검수 완료 시트를 읽어 data/final/foods_final.json 생성

검수 규칙 (07 PRD 거버넌스)
- approve=Y 인 행만 verified=true 로 적재.
- 식이 최종값 yes/no 는 diet_sources 에 URL 2개 이상 있을 때만 인정. 아니면 unknown 으로 강등.
- 재료-식이 모순(동물성 재료인데 vegan=yes 등)은 export 단계에서 auto_flags 로 표시, import 단계에서는 차단.
"""
from __future__ import annotations

import sys

from common import DIET_KEYS, DRAFT, FINAL, RAW, SEED, WIKI_LANGS, read_csv, read_json, write_csv, write_json

REVIEW_FIELDS = ["slug", "country_code", "name_ko", "name_en", "origin_note", "demo_required", "auto_flags", "summary", "history",
                 "culture_story", "taste_tags", "ingredients_main", "allergens",
                 *[f"draft_{k}" for k in DIET_KEYS], "diet_reason",
                 *[f"final_{k}" for k in DIET_KEYS], "diet_note", "diet_sources", "approve", "reviewer", "review_memo"]


def consistency_flags(d: dict) -> list[str]:
    """재료 정보와 식이 판정의 모순을 찾는다. d 는 LLM 초안 또는 최종 데이터."""
    ings = [i for i in d.get("ingredients") or [] if isinstance(i, dict)]  # 스키마 오류 초안도 export 는 되도록
    diet = d.get("diet") or d.get("diet_draft") or {}
    flags = []
    animal = [i.get("name_en", "?") for i in ings if i.get("animal_origin") and i.get("role") != "optional"]
    if animal and diet.get("vegan") == "yes":
        flags.append(f"vegan=yes 인데 동물성 재료({', '.join(animal)})")
    meat = [i.get("name_en", "?") for i in ings if i.get("category") in ("meat", "poultry", "seafood") and i.get("role") != "optional"]
    if meat and diet.get("vegetarian") == "yes":
        flags.append(f"vegetarian=yes 인데 육류·해산물({', '.join(meat)})")
    pork = [i.get("name_en", "?") for i in ings if i.get("pork")]
    if pork and diet.get("halal") not in ("no", None):
        flags.append(f"돼지고기({', '.join(pork)}) 포함인데 halal≠no")
    if any(i.get("allergen") == "dairy" and i.get("role") != "optional" for i in ings) and diet.get("dairy_free") == "yes":
        flags.append("유제품 포함인데 dairy_free=yes")
    if any(i.get("allergen") == "wheat" and i.get("role") != "optional" for i in ings) and diet.get("gluten_free") == "yes":
        flags.append("밀 포함인데 gluten_free=yes")
    return flags


def completeness_flags(d: dict, wd: dict) -> list[str]:
    flags = []
    if not d.get("summary"):
        flags.append("summary 없음")
    if not d.get("culture_story"):
        flags.append("culture_story 없음(근거 부족)")
    if wd.get("needs_review"):
        flags.append(wd["needs_review"])
    if wd.get("origin_mismatch"):
        flags.append(f"Wikidata 원산지 {wd.get('origin_codes')} ≠ 배정 국가")
    return flags


def export() -> None:
    drafts = read_json(DRAFT / "foods_draft.json", {})
    wd = read_json(RAW / "wikidata.json", {})
    rows = []
    for t in read_csv(SEED / "dish_targets.csv"):
        v = drafts.get(t["slug"])
        if not v:
            continue
        d = v["draft"] or {}
        bad = [f"AI 초안 스키마 오류({v['needs_review'][0][:60]}) → s05 --needs-review --smart 로 다시 만들기"] if v.get("needs_review") else []
        flags = bad + consistency_flags(d) + completeness_flags(d, wd.get(t["slug"], {}))
        dd = d.get("diet_draft") or {}
        ings = [i for i in d.get("ingredients") or [] if isinstance(i, dict)]
        rows.append({**t, "auto_flags": " / ".join(flags), "summary": d.get("summary"), "history": d.get("history"),
                     "culture_story": d.get("culture_story"), "taste_tags": ",".join(map(str, d.get("taste_tags") or [])),
                     "ingredients_main": ", ".join(f"{i.get('name_ko')}({i.get('name_en')})" for i in ings if i.get("role") == "main"),
                     "allergens": ",".join(map(str, d.get("allergens") or [])),
                     **{f"draft_{k}": dd.get(k) for k in DIET_KEYS}, "diet_reason": dd.get("reason"),
                     **{f"final_{k}": "" for k in DIET_KEYS}, "diet_note": "", "diet_sources": "", "approve": "", "reviewer": "", "review_memo": ""})
    rows.sort(key=lambda r: (r["demo_required"] != "Y", r["auto_flags"] == "", r["country_code"]))
    write_csv(DRAFT / "review_sheet.csv", rows, REVIEW_FIELDS)
    flagged = sum(1 for r in rows if r["auto_flags"])
    print(f"✔ 검수 시트 {len(rows)}행 → data/draft/review_sheet.csv (자동 경고 {flagged}행, 데모 필수 음식이 맨 위)")


def finalize_diet(row: dict) -> tuple[dict, list[str]]:
    sources = [s for s in (row.get("diet_sources") or "").replace(",", " ").split() if s.startswith("http")]
    diet, warns = {}, []
    for k in DIET_KEYS:
        val = (row.get(f"final_{k}") or "unknown").strip().lower()
        val = val if val in ("yes", "depends", "no", "unknown") else "unknown"
        if val in ("yes", "no") and len(sources) < 2:
            warns.append(f"{row['slug']}.{k}={val} → 출처 {len(sources)}개라 unknown 으로 강등")
            val = "unknown"
        diet[k] = val
    return diet, warns


def do_import() -> None:
    drafts = read_json(DRAFT / "foods_draft.json", {})
    wd, wp = read_json(RAW / "wikidata.json", {}), read_json(RAW / "wikipedia.json", {})
    final, warns, blocked, broken = {}, [], [], []
    for row in read_csv(DRAFT / "review_sheet.csv"):
        if (row.get("approve") or "").strip().upper() != "Y":
            continue
        if drafts[row["slug"]].get("needs_review"):  # 구조가 깨진 초안은 승인해도 적재하지 않는다 → s05 로 다시 만든 뒤 export 부터
            broken.append(f"{row['slug']}: AI 초안 스키마 오류 — s05 --needs-review 로 다시 만든 뒤 export 부터 다시")
            continue
        d = dict(drafts[row["slug"]]["draft"])
        for f in ("summary", "history", "culture_story"):  # 검수자가 시트에서 고친 문장을 반영
            d[f] = row.get(f) or d.get(f)
        d["diet"], w = finalize_diet(row)
        warns += w
        flags = consistency_flags(d)
        if flags:
            blocked.append(f"{row['slug']}: {' / '.join(flags)}")
            continue
        img = (wp.get(row["slug"]) or {}).get("image") or {}
        final[row["slug"]] = {
            **{k: row.get(k) for k in ("slug", "name_ko", "name_en", "country_code", "origin_note")},
            **d, "diet_note": row.get("diet_note") or None, "diet_sources": row.get("diet_sources"),
            "wikidata_qid": (wd.get(row["slug"]) or {}).get("qid"),
            "wikipedia": {lang: url for lang in WIKI_LANGS if (url := ((wp.get(row["slug"]) or {}).get(lang) or {}).get("url"))},
            "image_url": img.get("url"), "image_page": img.get("page"), "image_credit": f"{img.get('artist') or '작자 미상'} / {img.get('license') or '라이선스 확인 필요'} / {img.get('page') or ''}" if img else None,
            "reviewer": row.get("reviewer"),
            "evidence_used": d.get("used_evidence", []),
        }
    write_json(FINAL / "foods_final.json", final)
    rel_rows = [r for r in read_csv(DRAFT / "relations_review.csv")] if (DRAFT / "relations_review.csv").exists() else []
    ok_rels = [r for r in rel_rows if (r.get("approve") or "").strip().upper() == "Y" and r["from"] in final and r["to"] in final]
    write_csv(FINAL / "relations_final.csv", ok_rels, ["from", "to", "type", "strength", "description", "approve"])
    print(f"✔ 관계 승인 {len(ok_rels)}건 → data/final/relations_final.csv")
    print(f"✔ 승인 {len(final)}건 → data/final/foods_final.json")
    for w in warns:
        print("  ⚠", w)
    for b in blocked:
        print("  ⛔ 차단(모순):", b)
    for b in broken:
        print("  ⛔ 차단(초안 오류):", b)


if __name__ == "__main__":
    {"export": export, "import": do_import}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: print(__doc__))()
