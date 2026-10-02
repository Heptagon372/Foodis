"""⑥ 음식 간 관계(food_relations) 후보 자동 생성 — 모두 verified=false, 사람 검수 후 노출.

규칙 기반 (LLM 불필요, 재현 가능):
- shares_ingredient : 주재료(role=main) 정규화 이름이 겹치고 국가가 다를 때. strength = 겹친 주재료 수(최대 5)
- same_technique    : cooking_method 가 같고 + 주재료 카테고리가 하나 이상 겹치고 + 국가가 다를 때 (strength 2)
- similar_taste     : taste_tags Jaccard ≥ 0.5 이고 국가가 다를 때. strength = round(J*5)
- 테마 클러스터     : data/seed/relation_themes.csv 에 정의한 '만두 로드' 등 역사적 연결(historical_link)
출력: data/draft/relations_draft.json  [{from, to, type, description, strength}]
"""
from __future__ import annotations

import itertools
import re
from collections import Counter

from common import DRAFT, SEED, read_csv, read_json, write_csv, write_json

STOP = {"salt", "water", "oil", "sugar", "black pepper", "pepper", "vegetable oil", "olive oil"}


def norm(name: str) -> str:
    n = re.sub(r"[^a-z ]", "", name.lower()).strip()
    n = re.sub(r"(es|s)$", "", n) if len(n) > 4 else n
    return n


def main_ings(d: dict) -> set[str]:
    return {norm(i["name_en"]) for i in d.get("ingredients", []) if i.get("role") == "main" and norm(i["name_en"]) not in STOP}


def cats(d: dict) -> set[str]:
    return {i["category"] for i in d.get("ingredients", []) if i.get("role") == "main"}


def jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if a | b else 0.0


def build(drafts: dict[str, dict], country: dict[str, str], themes: list[dict], per_food_cap: int = 4) -> list[dict]:
    """관계 후보 생성. 흔한 재료(밀가루·양파 등)로 관계가 폭증하지 않도록
    - 재료는 전체 음식의 10% 이하에서만 쓰이는 '특징적 재료'만 인정 (문서 빈도 필터)
    - 음식 하나당 관계 유형별 상위 per_food_cap 개만 남김 (테마 관계는 상한 없음)"""
    n = max(len(drafts), 1)
    df = Counter(x for d in drafts.values() for x in main_ings(d))
    distinctive = {x for x, c in df.items() if c <= max(3, n * 0.10)}
    method_df = Counter(d.get("cooking_method") for d in drafts.values())
    rels: dict[tuple, dict] = {}

    def add(a, b, typ, desc, strength):
        key = tuple(sorted((a, b))) + (typ,)
        if key not in rels or rels[key]["strength"] < strength:
            rels[key] = {"from": key[0], "to": key[1], "type": typ, "description": desc, "strength": max(1, min(5, strength))}

    for a, b in itertools.combinations(sorted(drafts), 2):
        if country[a] == country[b]:
            continue
        da, db = drafts[a], drafts[b]
        shared = (main_ings(da) & main_ings(db)) & distinctive
        if shared:
            add(a, b, "shares_ingredient", f"공통 주재료: {', '.join(sorted(shared))}", len(shared) + 2)
        m = da.get("cooking_method")
        if m and m == db.get("cooking_method") and m not in ("mixed", "boiled") and method_df[m] <= n * 0.25:
            common = (cats(da) & cats(db)) - {"grain", "vegetable", "spice", "oil", "other"}
            if common:
                add(a, b, "same_technique", f"같은 조리법({m}) · 같은 재료군({', '.join(sorted(common))})", 2)
        j = jaccard(set(da.get("taste_tags", [])), set(db.get("taste_tags", [])))
        if j >= 0.6:
            add(a, b, "similar_taste", f"맛 태그 유사도 {j:.2f}", round(j * 5))

    # 유형별 상한: 각 음식이 해당 유형에서 상위 per_food_cap 안에 드는 관계만 유지
    kept: dict[tuple, dict] = {}
    for typ in ("shares_ingredient", "same_technique", "similar_taste"):
        cand = sorted((r for r in rels.values() if r["type"] == typ), key=lambda r: -r["strength"])
        used: Counter = Counter()
        for r in cand:
            if used[r["from"]] < per_food_cap and used[r["to"]] < per_food_cap:
                used[r["from"]] += 1
                used[r["to"]] += 1
                kept[(r["from"], r["to"], typ)] = r
    rels = kept

    by_theme: dict[str, list[dict]] = {}
    for t in themes:
        by_theme.setdefault(t["theme"], []).append(t)
    for theme, members in by_theme.items():
        note = next((m["note"] for m in members if m["note"]), "")
        for x, y in itertools.combinations(members, 2):
            if x["slug"] in country and y["slug"] in country:
                add(x["slug"], y["slug"], x.get("type") or "historical_link", f"[{theme}] {note}".strip(), 4)
    return sorted(rels.values(), key=lambda r: (-r["strength"], r["type"], r["from"]))


def main() -> None:
    # 스키마 오류로 검수 표시된 초안(needs_review)은 재료 구조를 믿을 수 없어 관계 후보에서 뺀다
    drafts = {s: v["draft"] for s, v in read_json(DRAFT / "foods_draft.json", {}).items() if not v.get("needs_review")}
    country = {t["slug"]: t["country_code"] for t in read_csv(SEED / "dish_targets.csv") if t["slug"] in drafts}
    themes = read_csv(SEED / "relation_themes.csv")
    rels = build(drafts, country, themes)
    write_json(DRAFT / "relations_draft.json", rels)
    name = {t["slug"]: t["name_ko"] for t in read_csv(SEED / "dish_targets.csv")}
    write_csv(DRAFT / "relations_review.csv",
              [{**r, "from_name": name.get(r["from"]), "to_name": name.get(r["to"]), "approve": "", "review_memo": ""} for r in rels],
              ["from", "from_name", "to", "to_name", "type", "strength", "description", "approve", "review_memo"])
    print(f"✔ 관계 후보 {len(rels)}건 {dict(Counter(r['type'] for r in rels))} → data/draft/relations_review.csv (approve=Y 표시 후 s07 import)")
    if len(rels) < 300:
        print("ℹ 목표 300건 미만 → relation_themes.csv 에 테마를 추가하거나 STOP 목록을 조정하세요")


if __name__ == "__main__":
    main()
