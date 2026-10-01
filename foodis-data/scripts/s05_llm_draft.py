"""⑤ LLM 초안 생성 — 수집한 근거 자료 '안에서만' 한국어 필드를 작성한다.

원칙 (04 문서 · 할루시네이션 방지):
- 근거(context)에 없는 사실은 쓰지 않는다. 모르면 null.
- 식이 정보는 '초안(diet_draft)'으로만 저장. foods.diet_* 는 사람 검수 전까지 unknown 고정.
- 결과는 verified=false. 검수 시트(s07)에서 사람이 승인해야 서비스에 노출된다.

모델: Claude (tool_use 강제로 JSON 스키마 보장). 비용 추정 ≈ 180건 × (입력 3k + 출력 1.5k 토큰).
출력: data/draft/foods_draft.json
"""
from __future__ import annotations

import json
import os
import sys

from common import ALLERGENS, DIET_KEYS, DIET_LEVELS, DRAFT, RAW, SEED, TASTE_TAGS, WIKI_LANGS, Http, read_csv, read_json, require_env, write_json

API = "https://api.anthropic.com/v1/messages"
MODEL = os.environ.get("LLM_MODEL_DRAFT", "claude-sonnet-5")  # Sonnet 5 계열은 temperature 미지원(400) → 보내지 않음

TOOL = {
    "name": "save_food_draft",
    "description": "근거 자료만으로 작성한 음식 데이터 초안을 저장한다.",
    "input_schema": {
        "type": "object",
        "required": ["summary", "history", "culture_story", "cooking_method", "taste_tags", "course_type",
                     "name_local", "ingredients", "diet_draft", "allergens", "used_evidence"],
        "properties": {
            "summary": {"type": "string", "description": "한국어 1~2문장. 푸디가 그대로 소리 내 읽는다 → 해요체, 괄호·영문 철자 없이"},
            "history": {"type": ["string", "null"], "description": "한국어 2~4문장, 해요체. 근거에 없으면 null. 기원 논쟁은 '여러 설이 있어요'로"},
            "culture_story": {"type": ["string", "null"], "description": "언제·어떻게·누구와 먹는지. 한국어 250~400자, 해요체(60초 음성). 근거 없으면 null"},
            "cooking_method": {"type": "string", "enum": ["fermented", "grilled", "steamed", "stewed", "raw", "fried", "baked", "boiled", "stir_fried", "mixed"]},
            "taste_tags": {"type": "array", "items": {"type": "string", "enum": TASTE_TAGS}, "minItems": 2, "maxItems": 6},
            "course_type": {"type": "string", "enum": ["main", "side", "soup", "street", "dessert", "drink", "bread", "condiment"]},
            "name_local": {"type": ["string", "null"], "description": "현지 문자 표기 (근거에 있을 때만)"},
            "ingredients": {
                "type": "array", "maxItems": 12,
                "items": {"type": "object", "required": ["name_en", "name_ko", "role", "category", "animal_origin", "pork", "allergen"],
                          "properties": {
                              "name_en": {"type": "string"}, "name_ko": {"type": "string"},
                              "role": {"type": "string", "enum": ["main", "seasoning", "optional"]},
                              "category": {"type": "string", "enum": ["grain", "legume", "meat", "poultry", "seafood", "dairy", "egg", "vegetable", "fruit", "nut", "spice", "herb", "oil", "sweetener", "other"]},
                              "animal_origin": {"type": "boolean"}, "pork": {"type": "boolean"},
                              "allergen": {"type": ["string", "null"], "enum": ALLERGENS + [None]}}}},
            "diet_draft": {
                "type": "object", "required": DIET_KEYS + ["reason"],
                "properties": {**{k: {"type": "string", "enum": DIET_LEVELS} for k in DIET_KEYS},
                               "reason": {"type": "string", "description": "판단 근거 한 줄씩. 조리법에 따라 다르면 depends"}}},
            "allergens": {"type": "array", "items": {"type": "string", "enum": ALLERGENS}},
            "used_evidence": {"type": "array", "items": {"type": "string", "enum": [f"wikipedia_{lang}" for lang in WIKI_LANGS] + ["wikidata", "themealdb", "hansik800"]}},
        },
    },
}

SYSTEM = """너는 세계 음식 문화 데이터베이스의 편집자다. 사용자가 주는 <evidence> 안의 정보만 사용해 초안을 작성한다.
규칙:
1. evidence에 없는 연도·인물·수치·지명은 절대 쓰지 않는다. 확신이 없으면 해당 필드를 null 로 둔다.
2. 국가·문화 간 우열 표현, 고정관념, 기원 논쟁의 단정 금지. 여러 설이 있으면 '여러 설이 있다'고 쓴다.
3. 식이 판단은 대표 조리법 기준. 지역·식당마다 다르면 depends, 근거 부족하면 unknown. 할랄은 돼지고기·알코올 외에 도축 방식도 관련되므로 육류가 들어가면 최소 depends.
4. summary·history·culture_story 는 앱의 안내자 푸디가 그대로 읽어주는 문장이다(DB 스키마 "음성용", 03 문서 §5). 해요체로 쓰고 괄호·영문 철자·목록을 넣지 않는다. 음식 이름은 한국에서 통용되는 표기를 쓴다.
반드시 save_food_draft 도구로만 답한다."""


def build_evidence(t: dict, wd: dict, wp: dict, mdb: dict, hs: dict) -> str:
    parts = [f"<target name_ko='{t['name_ko']}' name_en='{t['name_en']}' country='{t['country_code']}' origin_note='{t['origin_note']}'/>"]
    if wd:
        parts.append(f"<wikidata qid='{wd.get('qid')}'>origin={wd.get('origin_codes')} materials={wd.get('materials')} instance_of={wd.get('instance_of')}</wikidata>")
    for lang in WIKI_LANGS:
        s = (wp or {}).get(lang)
        if s and s.get("extract"):
            parts.append(f"<wikipedia_{lang} url='{s['url']}'>{s['extract']}</wikipedia_{lang}>")
    if mdb:
        parts.append(f"<themealdb>ingredients={mdb.get('ingredients')}</themealdb>")
    if hs:
        parts.append(f"<hansik800>{json.dumps(hs, ensure_ascii=False)}</hansik800>")
    return "<evidence>\n" + "\n".join(parts) + "\n</evidence>"


def draft_one(http: Http, evidence: str) -> dict:
    res = http.post(API, json_body={
        "model": MODEL, "max_tokens": 2000, "system": SYSTEM,
        "tools": [TOOL], "tool_choice": {"type": "tool", "name": TOOL["name"]},
        "messages": [{"role": "user", "content": evidence}],
    }, headers={"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01"})
    block = next(b for b in res["content"] if b["type"] == "tool_use")
    return {"draft": block["input"], "usage": res.get("usage", {}), "model": res.get("model")}


def main() -> None:
    require_env("ANTHROPIC_API_KEY")
    only = set(sys.argv[1:])  # 특정 slug만: python s05_llm_draft.py kimchi injera
    http = Http(min_interval=0.2)
    wd, wp = read_json(RAW / "wikidata.json", {}), read_json(RAW / "wikipedia.json", {})
    mdb, hs = read_json(RAW / "themealdb.json", {}), read_json(RAW / "hansik800.json", {})
    out = read_json(DRAFT / "foods_draft.json", {})
    tokens_in = tokens_out = 0
    for t in read_csv(SEED / "dish_targets.csv"):
        s = t["slug"]
        if (only and s not in only) or (not only and s in out):
            continue
        if s not in wp:
            print(f"  ⚠ {s}: 근거 자료 없음 → 건너뜀 (s01/s02 결과 확인)")
            continue
        ev = build_evidence(t, wd.get(s, {}), wp.get(s, {}), mdb.get(s, {}), hs.get(s, {}))
        r = draft_one(http, ev)
        out[s] = {**r, "evidence": ev}
        tokens_in += r["usage"].get("input_tokens", 0)
        tokens_out += r["usage"].get("output_tokens", 0)
        write_json(DRAFT / "foods_draft.json", out)  # 건별 저장 → 중단돼도 이어서 실행 가능
        print(f"  ✎ {s}")
    print(f"✔ 초안 {len(out)}건 → data/draft/foods_draft.json  (이번 실행 토큰 in {tokens_in:,} / out {tokens_out:,})")


if __name__ == "__main__":
    main()
