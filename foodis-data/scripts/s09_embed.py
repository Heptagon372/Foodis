"""⑨ 음식 임베딩 생성 → food_embeddings upsert.

제공자: DATA_EMBED_PROVIDER = openai(기본) | gemini  — 앱(apps/web)의 EMBED_PROVIDER 와 반드시 같게.
        (DATA_EMBED_PROVIDER 가 비어 있으면 EMBED_PROVIDER 를 따른다)
모델:   EMBEDDING_MODEL (비우면 openai=text-embedding-3-small, gemini=gemini-embedding-2). 차원은 DB vector(1536) 에 맞춰 1536 고정.
        ※ 제공자·모델이 앱과 다르면 에러 없이 검색 결과만 엉망이 된다. 바꿀 때는 앱·데이터를 같이 바꾸고 전부 다시 임베딩.
비용:   280건 × ~400토큰 ≈ 11만 토큰 → openai $0.002, gemini $0.02 수준.
임베딩 텍스트는 '사용자가 말로 표현할 법한 특징' 위주로 구성 (이름·국가·요약·맛·재료·먹는 방식).
옵션: --dry-run (텍스트만 data/final/embedding_texts.json 으로 저장, 키 불필요)

Gemini (확인일 2026-10-02, https://ai.google.dev/gemini-api/docs/embeddings):
- 기본 3072차원 → output_dimensionality=1536 으로 줄인다 (권장값 768·1536·3072 중 하나).
- gemini-embedding-2 는 줄인 차원도 자동 정규화, gemini-embedding-001 은 직접 L2 정규화 필요 → 여기서는 항상 정규화(이미 단위 벡터면 그대로).
- gemini-embedding-2 는 task_type 대신 텍스트 앞에 형식을 붙인다: 문서 'title: {제목} | text: {내용}',
  검색어 'task: search result | query: {검색어}'. gemini-embedding-001 은 task_type RETRIEVAL_DOCUMENT / RETRIEVAL_QUERY.
- 여러 개를 한 번에 보낼 때는 batchEmbedContents (요청마다 임베딩 1개) — embedContent 에 여러 개를 넣으면 하나로 합쳐진다.
  공식 SDK(google-genai 2.27)의 embed_content 도 batchEmbedContents + requests[].outputDimensionality 로 보낸다.
"""
from __future__ import annotations

import json
import math
import os
import sys

from common import FINAL, SEED, Http, chunks, read_csv, read_json, require_env, write_json

DIMS = 1536  # DB food_embeddings.embedding vector(1536)
PROVIDER = (os.environ.get("DATA_EMBED_PROVIDER") or os.environ.get("EMBED_PROVIDER") or "openai").strip().lower()
DEFAULT_MODEL = {"openai": "text-embedding-3-small", "gemini": "gemini-embedding-2"}
MODEL = (os.environ.get("EMBEDDING_MODEL") or "").strip() or DEFAULT_MODEL.get(PROVIDER, "")
KEY_ENV = {"openai": "OPENAI_API_KEY", "gemini": "GEMINI_API_KEY"}
# USD / 100만 토큰 (확인일 2026-10-02) — https://developers.openai.com/api/docs/pricing , https://ai.google.dev/gemini-api/docs/pricing
EMBED_PRICE = {"text-embedding-3-small": 0.02, "text-embedding-3-large": 0.13, "gemini-embedding-2": 0.20}
BATCH = {"openai": 100, "gemini": 50}
GEMINI_API = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_QUERY_FORMAT = "task: search result | query: {query}"  # 앱이 검색어에 붙여야 하는 형식 (gemini-embedding-2)

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


def check_config() -> None:
    """제공자·모델 조합이 맞는지 돈 쓰기 전에 확인."""
    if PROVIDER not in DEFAULT_MODEL:
        raise SystemExit(f"DATA_EMBED_PROVIDER={PROVIDER} 는 지원하지 않아요 (openai | gemini)")
    if (PROVIDER == "gemini") != MODEL.startswith("gemini-"):
        raise SystemExit(f"EMBEDDING_MODEL={MODEL} 은(는) {PROVIDER} 임베딩 모델이 아니에요. "
                         f"비우면 {DEFAULT_MODEL[PROVIDER]} 를 써요 (앱의 EMBEDDING_MODEL 과도 같아야 함)")


def warn_app_match() -> None:
    bar = "!" * 72
    print(bar)
    print(f"!! 임베딩: {PROVIDER} / {MODEL} / {DIMS}차원")
    print("!! 앱(apps/web)의 EMBED_PROVIDER · EMBEDDING_MODEL 이 이것과 다르면 검색이 조용히 망가져요 (에러 없음).")
    if PROVIDER == "gemini" and MODEL.startswith("gemini-embedding-2"):
        print(f"!! 앱은 검색어를 '{GEMINI_QUERY_FORMAT}' 형식으로, output_dimensionality={DIMS} 로 임베딩해야 해요.")
    elif PROVIDER == "gemini":
        print(f"!! 앱은 검색어를 task_type=RETRIEVAL_QUERY, output_dimensionality={DIMS} 로 임베딩하고 L2 정규화해야 해요.")
    print("!! 제공자·모델을 바꿨다면 기존 food_embeddings 를 전부 다시 만들어야 해요 (섞이면 안 됨).")
    print(bar)


def l2_normalize(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v))
    if n == 0:
        raise RuntimeError("영벡터 임베딩 — 응답 확인 필요")
    return [x / n for x in v]


def gemini_doc(title: str, text: str) -> str:
    return f"title: {title} | text: {text}" if MODEL.startswith("gemini-embedding-2") else text


def embed_openai(http: Http, texts: list[str]) -> tuple[list[list[float]], int | None]:
    body: dict = {"model": MODEL, "input": texts}
    if MODEL.startswith("text-embedding-3"):
        body["dimensions"] = DIMS  # -small 은 기본이 1536 이라 결과 동일, -large(3072)도 DB 에 맞게 줄어든다
    res = http.post("https://api.openai.com/v1/embeddings", json_body=body,
                    headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"}, cache=False)
    return [d["embedding"] for d in res["data"]], (res.get("usage") or {}).get("total_tokens")


def embed_gemini(http: Http, texts: list[str], titles: list[str]) -> tuple[list[list[float]], int | None]:
    reqs = []
    for text, title in zip(texts, titles):
        r: dict = {"model": f"models/{MODEL}", "content": {"parts": [{"text": gemini_doc(title, text)}]}, "outputDimensionality": DIMS}
        if not MODEL.startswith("gemini-embedding-2"):
            r.update(taskType="RETRIEVAL_DOCUMENT", title=title)  # 001: task_type 지원(2 는 미지원 → 텍스트 형식으로)
        reqs.append(r)
    res = http.post(f"{GEMINI_API}/models/{MODEL}:batchEmbedContents", json_body={"requests": reqs},
                    headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]}, cache=False, retries=6)
    return [l2_normalize(e["values"]) for e in res["embeddings"]], (res.get("usageMetadata") or {}).get("promptTokenCount")


def main() -> None:
    dry = "--dry-run" in sys.argv
    final = read_json(FINAL / "foods_final.json", {})
    cko = {c["code"]: c["name_ko"] for c in read_csv(SEED / "countries.csv")}
    texts = {s: embedding_text(f, cko.get(f["country_code"], f["country_code"])) for s, f in final.items()}
    write_json(FINAL / "embedding_texts.json", texts)
    check_config()
    if dry:
        est = sum(len(t) for t in texts.values())  # 한국어 위주라 글자 수 ≈ 토큰 수로 넉넉히
        p = EMBED_PRICE.get(MODEL)
        cost = f"≈ ${est * p / 1e6:.4f}" if p else "가격 미상"
        print(f"✔ (dry-run) 임베딩 텍스트 {len(texts)}건 → data/final/embedding_texts.json  ({PROVIDER} / {MODEL}, ~{est:,}토큰 {cost})")
        return
    require_env(KEY_ENV[PROVIDER], "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
    warn_app_match()
    http = Http(min_interval=0.2, cache_dir=None)
    sb = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1"
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    sh = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    ids = {r["slug"]: r["id"] for r in http.get(f"{sb}/foods", params={"select": "id,slug"}, headers=sh, cache=False)}
    slugs = [s for s in texts if s in ids]
    total_tokens = 0
    for batch in chunks(slugs, BATCH[PROVIDER]):
        if PROVIDER == "gemini":
            vecs, tokens = embed_gemini(http, [texts[s] for s in batch], [final[s]["name_ko"] for s in batch])
        else:
            vecs, tokens = embed_openai(http, [texts[s] for s in batch])
        bad = [len(v) for v in vecs if len(v) != DIMS]
        if len(vecs) != len(batch) or bad:
            raise SystemExit(f"⛔ 임베딩 개수/차원 불일치 (기대 {len(batch)}개 × {DIMS}, 받은 {len(vecs)}개 {bad[:3]}) — 저장하지 않았어요")
        rows = [{"food_id": ids[s], "embedding": json.dumps(v), "text_used": texts[s], "model": MODEL} for s, v in zip(batch, vecs)]
        http.post(f"{sb}/food_embeddings", params={"on_conflict": "food_id"}, json_body=rows,
                  headers={**sh, "Prefer": "resolution=merge-duplicates"}, cache=False)
        total_tokens += tokens or 0
        print(f"  · {len(rows)}건 임베딩 저장 (토큰 {tokens})")
    p = EMBED_PRICE.get(MODEL)
    print(f"✔ 임베딩 {len(slugs)}건 완료 ({PROVIDER} / {MODEL} / {DIMS}차원, 토큰 {total_tokens:,}"
          f"{f' ≈ ${total_tokens * p / 1e6:.4f}' if p else ''})")


if __name__ == "__main__":
    main()
