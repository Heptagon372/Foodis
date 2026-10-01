"""⑧ Supabase 적재 (PostgREST upsert, service_role 키 사용 — 서버/로컬에서만 실행).

순서: data_sources → countries → foods(verified=true, 승인분) → ingredients → food_ingredients → sources → food_relations(검수 승인분)
입력: data/seed/countries.csv, data/final/foods_final.json, data/final/relations_final.csv(선택)
옵션: --dry-run  (전송 없이 페이로드 개수만 출력)
"""
from __future__ import annotations

import os
import sys
from datetime import date

from common import FINAL, RAW, SEED, Http, chunks, read_csv, read_json, require_env, slugify

DRY = "--dry-run" in sys.argv


class Rest:
    def __init__(self):
        if not DRY:
            require_env("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
        self.base = os.environ.get("SUPABASE_URL", "http://dry-run").rstrip("/") + "/rest/v1"
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        self.h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
                  "Prefer": "resolution=merge-duplicates,return=representation"}
        self.http = Http(min_interval=0.1, cache_dir=None)

    def upsert(self, table: str, rows: list[dict], on_conflict: str) -> list[dict]:
        if DRY or not rows:
            print(f"  · {table}: {len(rows)}행 {'(dry-run)' if DRY else ''}")
            return [{**r, "id": f"dry-{i}"} for i, r in enumerate(rows)]
        out = []
        for b in chunks(rows, 200):
            out += self.http.post(f"{self.base}/{table}", params={"on_conflict": on_conflict}, json_body=b, headers=self.h, cache=False)
        print(f"  · {table}: {len(out)}행 upsert")
        return out


def build_payloads(countries: list[dict], final: dict) -> dict[str, list[dict]]:
    foods, ings, links, srcs = [], {}, [], []
    for s, f in final.items():
        foods.append({
            "slug": s, "name_ko": f["name_ko"], "name_en": f["name_en"], "name_local": f.get("name_local"),
            "country_code": f["country_code"], "origin_note": f.get("origin_note") or None,
            "summary": f.get("summary"), "history": f.get("history"), "culture_story": f.get("culture_story"),
            "cooking_method": f.get("cooking_method"), "taste_tags": f.get("taste_tags", []), "course_type": f.get("course_type"),
            "image_url": f.get("image_url"), "image_credit": f.get("image_credit"),
            **{f"diet_{k}": v for k, v in f["diet"].items()}, "allergens": f.get("allergens", []), "diet_note": f.get("diet_note"),
            "wikidata_qid": f.get("wikidata_qid"), "wikipedia_en": f["wikipedia"].get("en"), "wikipedia_ko": f["wikipedia"].get("ko"),
            "verified": True, "verified_at": date.today().isoformat(),
        })
        for i in f.get("ingredients", []):
            key = slugify(i["name_en"])
            ings.setdefault(key, {"slug": key, "name_ko": i["name_ko"], "name_en": i["name_en"], "category": i["category"],
                                  "allergen": i.get("allergen"), "animal_origin": i["animal_origin"], "pork": i["pork"]})
            links.append({"food_slug": s, "ingredient_slug": key, "role": i["role"]})
        def src(field, url, title, data_source_id, license_):
            # PostgREST 일괄 upsert는 모든 행의 키가 같아야 하므로 항상 같은 필드 구성으로 만든다
            srcs.append({"food_slug": s, "field": field, "url": url, "title": title,
                         "source_type": data_source_id, "license": license_, "data_source_id": data_source_id})

        for lang, url in f["wikipedia"].items():
            if url:
                src("summary,history,culture_story", url, f"Wikipedia ({lang})", "wikipedia", "CC BY-SA 4.0")
        if f.get("wikidata_qid"):
            src("origin,ingredients", f"https://www.wikidata.org/wiki/{f['wikidata_qid']}", "Wikidata", "wikidata", "CC0")
        if f.get("image_page"):
            src("image", f["image_page"], "Wikimedia Commons", "wikimedia_commons", (f.get("image_credit") or "").split(" / ")[1] if " / " in (f.get("image_credit") or "") else None)
        if "hansik800" in f.get("evidence_used", []):
            src("name_en,summary", "https://www.data.go.kr/data/15129784/fileData.do", "한식진흥원 한식메뉴 외국어표기 800선", "hansik800", "공공데이터")
        if "themealdb" in f.get("evidence_used", []):
            src("ingredients", "https://www.themealdb.com", "TheMealDB (재료 교차검증)", "themealdb", "reference")
        src("summary,history,culture_story", f"foodis://draft/{s}", "FOODIS AI 초안 (근거 기반, 검수 완료)", "foodis_llm_draft", "자체 작성")
        for url in (f.get("diet_sources") or "").replace(",", " ").split():
            if url.startswith("http"):
                src("diet", url, "검수자 첨부 출처", "foodis_review", None)
    return {"countries": countries, "foods": foods, "ingredients": list(ings.values()), "links": links, "sources": srcs}


def read_csv_policy() -> list[dict]:
    """data/seed/data_sources.csv → data_sources 행 (0002 마이그레이션 시드와 동일, CSV 수정분 동기화용)."""
    out = []
    for r in read_csv(SEED / "data_sources.csv"):
        out.append({k: (None if v in ("", "—") else v) for k, v in r.items()})
        out[-1]["commercial_use"] = {"Y": True, "N": False}.get(r["commercial_use"])
    return out


def main() -> None:
    final = read_json(FINAL / "foods_final.json", {})
    if not final:
        raise SystemExit("data/final/foods_final.json 이 비어 있습니다. s07_review.py import 먼저 실행")
    p = build_payloads(read_csv(SEED / "countries.csv"), final)
    rest = Rest()
    rest.upsert("data_sources", read_csv_policy(), "id")
    rest.upsert("countries", p["countries"], "code")
    food_ids = {r["slug"]: r["id"] for r in rest.upsert("foods", p["foods"], "slug")}
    ing_ids = {r["slug"]: r["id"] for r in rest.upsert("ingredients", p["ingredients"], "slug")}
    rest.upsert("food_ingredients", [{"food_id": food_ids[l["food_slug"]], "ingredient_id": ing_ids[l["ingredient_slug"]], "role": l["role"]}
                                     for l in p["links"]], "food_id,ingredient_id")
    rest.upsert("sources", [{k: v for k, v in {**s, "food_id": food_ids[s["food_slug"]]}.items() if k != "food_slug"} for s in p["sources"]], "food_id,field,url")
    rel_path = FINAL / "relations_final.csv"
    if rel_path.exists():
        rels = [{"from_food_id": food_ids[r["from"]], "to_food_id": food_ids[r["to"]], "relation_type": r["type"],
                 "description": r["description"], "strength": int(r["strength"]), "verified": True}
                for r in read_csv(rel_path) if r.get("approve", "").upper() == "Y" and r["from"] in food_ids and r["to"] in food_ids]
        rest.upsert("food_relations", rels, "from_food_id,to_food_id,relation_type")
    print("✔ 적재 완료. 다음: python s09_embed.py")


if __name__ == "__main__":
    main()
