"""⑨ 음식 임베딩 생성 → food_embeddings upsert.

모델: OpenAI text-embedding-3-small (1536차원). 180건 × ~400토큰 ≈ 7만 토큰 → 비용 1센트 미만.
임베딩 텍스트는 '사용자가 말로 표현할 법한 특징' 위주로 구성 (이름·국가·요약·맛·재료·먹는 방식).
옵션: --dry-run (텍스트만 data/final/embedding_texts.json 으로 저장)
"""
from __future__ import annotations

import json
import os
import sys

from common import FINAL, SEED, Http, chunks, read_csv, read_json, require_env, write_json

MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
TAG_KO = {"spicy": "매운", "fermented": "발효", "soupy": "국물", "sweet": "단", "sour": "새콤한", "salty": "짭짤한",
          "umami": "감칠맛", "smoky": "훈연향", "herbal": "허브향", "creamy": "크리미한", "crispy": "바삭한", "rich": "진한",
          "fresh": "산뜻한", "nutty": "고소한", "grilled": "구운", "fried": "튀긴", "rice": "밥", "noodle": "면",
          "bread": "빵", "dumpling": "만두", "meat": "고기", "seafood": "해산물", "vegetable": "채소", "legume": "콩",
          "dairy": "유제품", "street_food": "길거리 음식"}


def embedding_text(f: dict, country_ko: str) -> str:
    tags = ", ".join(TAG_KO.get(t, t) for t in f.get("taste_tags", []))
    ings = ", ".join(i["name_ko"] for i in f.get("ingredients", []) if i.get("role") == "main")
    diet = ", ".join(k for k, v in f.get("diet", {}).items() if v == "yes")
    lines = [f"{f['name_ko']} ({f['name_en']}) — {country_ko} 음식", f.get("summary") or "", f"맛·특징: {tags}",
             f"주재료: {ings}", f"조리법: {f.get('cooking_method', '')}, 분류: {f.get('course_type', '')}"]
    if diet:
        lines.append(f"식이: {diet}")
    if f.get("culture_story"):
        lines.append(f["culture_story"][:300])
    return "\n".join(l for l in lines if l.strip())


def main() -> None:
    dry = "--dry-run" in sys.argv
    final = read_json(FINAL / "foods_final.json", {})
    cko = {c["code"]: c["name_ko"] for c in read_csv(SEED / "countries.csv")}
    texts = {s: embedding_text(f, cko.get(f["country_code"], f["country_code"])) for s, f in final.items()}
    write_json(FINAL / "embedding_texts.json", texts)
    if dry:
        print(f"✔ (dry-run) 임베딩 텍스트 {len(texts)}건 → data/final/embedding_texts.json")
        return
    require_env("OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
    http = Http(min_interval=0.2, cache_dir=None)
    sb = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1"
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    sh = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    ids = {r["slug"]: r["id"] for r in http.get(f"{sb}/foods", params={"select": "id,slug"}, headers=sh, cache=False)}
    slugs = [s for s in texts if s in ids]
    for batch in chunks(slugs, 100):
        res = http.post("https://api.openai.com/v1/embeddings", json_body={"model": MODEL, "input": [texts[s] for s in batch]},
                        headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"}, cache=False)
        rows = [{"food_id": ids[s], "embedding": json.dumps(d["embedding"]), "text_used": texts[s], "model": MODEL}
                for s, d in zip(batch, res["data"])]
        http.post(f"{sb}/food_embeddings", params={"on_conflict": "food_id"}, json_body=rows,
                  headers={**sh, "Prefer": "resolution=merge-duplicates"}, cache=False)
        print(f"  · {len(rows)}건 임베딩 저장 (토큰 {res.get('usage', {}).get('total_tokens')})")
    print(f"✔ 임베딩 {len(slugs)}건 완료")


if __name__ == "__main__":
    main()
