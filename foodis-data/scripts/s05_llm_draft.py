"""⑤ LLM 초안 생성 — 수집한 근거 자료 '안에서만' 한국어 필드를 작성한다.

원칙 (04 문서 · 할루시네이션 방지):
- 근거(context)에 없는 사실은 쓰지 않는다. 모르면 null.
- 식이 정보는 '초안(diet_draft)'으로만 저장. foods.diet_* 는 사람 검수 전까지 unknown 고정.
- 결과는 verified=false. 검수 시트(s07)에서 사람이 승인해야 서비스에 노출된다.

모델: scripts/llm.py — DATA_LLM_PROVIDER = gemini(기본) | openai | anthropic. JSON 스키마로 구조화 출력 강제 + 검증,
      스키마 위반이면 1회 다시 요청, 그래도 틀리면 needs_review 로 저장 → s07 검수 시트 맨 위에 경고.
출력: data/draft/foods_draft.json  (건별 저장 → 중단돼도 다시 실행하면 이어서)

사용법
  python s05_llm_draft.py --dry-run         비용 추정만 (키 불필요, 제공자별 비교표)
  python s05_llm_draft.py --demo            데모 필수 16건만 먼저 (품질 확인용)
  python s05_llm_draft.py kimchi injera     특정 음식만 (이미 있어도 다시 만듦)
  python s05_llm_draft.py --needs-review --smart   스키마 오류 났던 것만 더 똑똑한 모델로 다시
  python s05_llm_draft.py --yes             남은 전체 실행 (--yes 없이는 추정만 보여 주고 멈춤 — 실수로 돈 쓰지 않게)
  옵션: --smart (smart 등급 모델) · --flex (Gemini·OpenAI Flex 처리, 50% 할인, 느림)
"""
from __future__ import annotations

import argparse
import json
import sys

import llm
from common import ALLERGENS, DIET_KEYS, DIET_LEVELS, DRAFT, RAW, SEED, TASTE_TAGS, WIKI_LANGS, read_csv, read_json, require_env, write_json

SCHEMA_NAME = "food_draft"
# 세 제공자 공통 부분집합 (llm.portable_problems 로 테스트):
# 모든 object 에 additionalProperties:false · 모든 속성 required(OpenAI strict) · null 허용은 type 배열, null 이 섞인 enum 은 anyOf
SCHEMA = {
    "type": "object",
    "additionalProperties": False,
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
            "items": {"type": "object", "additionalProperties": False,
                      "required": ["name_en", "name_ko", "role", "category", "animal_origin", "pork", "allergen"],
                      "properties": {
                          "name_en": {"type": "string"}, "name_ko": {"type": "string"},
                          "role": {"type": "string", "enum": ["main", "seasoning", "optional"]},
                          "category": {"type": "string", "enum": ["grain", "legume", "meat", "poultry", "seafood", "dairy", "egg", "vegetable", "fruit", "nut", "spice", "herb", "oil", "sweetener", "other"]},
                          "animal_origin": {"type": "boolean"}, "pork": {"type": "boolean"},
                          "allergen": {"anyOf": [{"type": "string", "enum": ALLERGENS}, {"type": "null"}],
                                       "description": "대표 알레르기 유발 성분. 없으면 null"}}}},
        "diet_draft": {
            "type": "object", "additionalProperties": False, "required": DIET_KEYS + ["reason"],
            "properties": {**{k: {"type": "string", "enum": DIET_LEVELS} for k in DIET_KEYS},
                           "reason": {"type": "string", "description": "판단 근거 한 줄씩. 조리법에 따라 다르면 depends"}}},
        "allergens": {"type": "array", "items": {"type": "string", "enum": ALLERGENS}},
        "used_evidence": {"type": "array", "items": {"type": "string", "enum": [f"wikipedia_{lang}" for lang in WIKI_LANGS] + ["wikidata", "themealdb", "hansik800"]}},
    },
}

SYSTEM = """너는 세계 음식 문화 데이터베이스의 편집자다. 사용자가 주는 <evidence> 안의 정보만 사용해 초안을 작성한다.
규칙:
1. evidence에 없는 연도·인물·수치·지명은 절대 쓰지 않는다. 확신이 없으면 해당 필드를 null 로 둔다.
2. 국가·문화 간 우열 표현, 고정관념, 기원 논쟁의 단정 금지. 여러 설이 있으면 '여러 설이 있다'고 쓴다.
3. 식이 판단은 대표 조리법 기준. 지역·식당마다 다르면 depends, 근거 부족하면 unknown. 할랄은 돼지고기·알코올 외에 도축 방식도 관련되므로 육류가 들어가면 최소 depends.
4. summary·history·culture_story 는 앱의 안내자 푸디가 그대로 읽어주는 문장이다(DB 스키마 "음성용", 03 문서 §5). 해요체로 쓰고 괄호·영문 철자·목록을 넣지 않는다. 음식 이름은 한국에서 통용되는 표기를 쓴다.
5. evidence 문장을 그대로 옮기지 말고 한국어로 새로 쓴다.
답은 주어진 JSON 스키마(food_draft)에 정확히 맞는 JSON 객체 하나로만 한다."""

DEFAULT_INPUT_TOKENS = 3000  # 근거 자료가 아직 없을 때(s01·s02 전) 1건당 입력 가정


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


def draft_one(evidence: str, cfg: llm.Config) -> dict:
    data, usage = llm.draft_json(SYSTEM, evidence, SCHEMA, cfg.tier, name=SCHEMA_NAME, cfg=cfg)
    rec = {"draft": data, "usage": usage, "model": usage["model"], "provider": usage["provider"]}
    if usage["needs_review"]:
        rec["needs_review"] = usage["needs_review"]
    return rec


def input_tokens_for(evidence: str) -> int:
    return llm.estimate_tokens(SYSTEM) + llm.estimate_tokens(json.dumps(SCHEMA, ensure_ascii=False)) + llm.estimate_tokens(evidence)


def print_estimate(cfg: llm.Config, est: dict, assumed: bool) -> None:
    p = est["price"]
    pr = f"${p[0]:g} / ${p[1]:g} per 1M{' × 50%(flex)' if cfg.service_tier == 'flex' else ''}" if p else "가격표에 없음(DATA_LLM_PRICE 로 지정)"
    print(f"ⓘ {cfg.label}")
    print(f"   대상 {est['n']}건 × (입력 ~{est['avg_in']:,}{'(가정)' if assumed else ''} + 출력 ~{est['out_each']:,} 토큰, 생각 포함 추정)"
          f" × ({pr}) ≈ {llm.fmt_usd(est['usd'])}")


def print_comparison(input_tokens: list[int]) -> None:
    """제공자·등급별 같은 대상의 비용 비교 (기본 모델 기준)."""
    print("\n   제공자별 비교 (같은 대상, 기본 모델)              표준        Flex/Batch(50%)")
    for prov in llm.PROVIDERS:
        for tier in llm.TIERS:
            m = llm.DEFAULT_MODELS[prov][tier]
            c = llm.Config(prov, m, tier)
            std = llm.estimate(c, input_tokens)["usd"]
            half = None if std is None or prov == "anthropic" else std * llm.FLEX_DISCOUNT
            print(f"   {prov:9} {tier:5} {m:24} {llm.fmt_usd(std):>10}   {llm.fmt_usd(half) if half is not None else '-':>10}")
    print("   ※ anthropic 은 Flex 가 없고 Batch API(50%)만 — 이 스크립트는 Batch 미지원. gemini-3.8-flash 는 2027-01-01 부터 두 배")


def main() -> None:
    ap = argparse.ArgumentParser(description="s05 LLM 초안 (Gemini · GPT · Claude)")
    ap.add_argument("slugs", nargs="*", help="특정 음식만 (이미 있어도 다시 만듦)")
    ap.add_argument("--demo", action="store_true", help="데모 필수(demo_required=Y) 음식만")
    ap.add_argument("--needs-review", action="store_true", help="스키마 오류로 검수 표시된 초안만 다시")
    ap.add_argument("--smart", action="store_true", help="smart 등급 모델 사용 (DATA_LLM_MODEL_SMART)")
    ap.add_argument("--flex", action="store_true", help="Flex 처리 (Gemini·OpenAI, 50%% 할인, 느림)")
    ap.add_argument("--dry-run", action="store_true", help="비용 추정만 하고 끝냄 (키 불필요)")
    ap.add_argument("--yes", action="store_true", help="선택 없이 남은 전체를 실행할 때 필요")
    args = ap.parse_args()

    cfg = llm.resolve("smart" if args.smart else "draft", flex=args.flex)
    wd, wp = read_json(RAW / "wikidata.json", {}), read_json(RAW / "wikipedia.json", {})
    mdb, hs = read_json(RAW / "themealdb.json", {}), read_json(RAW / "hansik800.json", {})
    out = read_json(DRAFT / "foods_draft.json", {})
    targets = read_csv(SEED / "dish_targets.csv")
    only = set(args.slugs)
    unknown = only - {t["slug"] for t in targets}
    if unknown:
        print(f"  ⚠ dish_targets.csv 에 없는 slug: {', '.join(sorted(unknown))}")
    explicit = bool(only or args.demo or args.needs_review)

    todo, no_evidence = [], []
    for t in targets:
        s = t["slug"]
        if only and s not in only:
            continue
        if args.demo and t.get("demo_required") != "Y":
            continue
        if args.needs_review and not (out.get(s) or {}).get("needs_review"):
            continue
        if not only and not args.needs_review and s in out:
            continue  # 이어서 실행: 이미 만든 초안은 건너뜀
        if s not in wp:
            no_evidence.append(s)
            continue
        todo.append((t, build_evidence(t, wd.get(s, {}), wp.get(s, {}), mdb.get(s, {}), hs.get(s, {}))))

    toks = [input_tokens_for(ev) for _, ev in todo]
    assumed = False
    if args.dry_run and not todo and no_evidence:
        toks, assumed = [DEFAULT_INPUT_TOKENS] * len(no_evidence), True  # s01·s02 전이라도 대략 비용은 보여 준다
    print_estimate(cfg, llm.estimate(cfg, toks), assumed)
    if no_evidence:
        print(f"  ⚠ 근거 자료 없음 {len(no_evidence)}건 → 건너뜀 (s01/s02 결과 확인): {', '.join(no_evidence[:8])}{' …' if len(no_evidence) > 8 else ''}")
    if args.dry_run:
        print_comparison(toks)
        print("✔ (dry-run) 호출하지 않았어요. 실행: --demo(16건 먼저) · 특정 slug · --yes(남은 전체)")
        return
    if todo and not explicit and not args.yes:
        print(f"⏸ 남은 전체 {len(todo)}건을 실행하려면 --yes 를 붙이세요 (먼저 --demo 로 16건 품질 확인 권장). 비용 비교는 --dry-run")
        sys.exit(2)

    if todo:
        require_env(llm.KEY_ENV[cfg.provider])
    tin = tout = 0
    spent = 0.0
    try:
        for t, ev in todo:
            s = t["slug"]
            r = draft_one(ev, cfg)
            out[s] = {**r, "evidence": ev}
            u = r["usage"]
            tin, tout = tin + u["input_tokens"], tout + u["output_tokens"]
            spent += u["cost_usd"] or 0.0
            write_json(DRAFT / "foods_draft.json", out)  # 건별 저장 → 중단돼도 이어서 실행 가능
            if r.get("needs_review"):
                print(f"  ⚠ {s}: 스키마 오류 → 검수 필요 ({r['needs_review'][0][:100]})")
            else:
                print(f"  ✎ {s}  (in {u['input_tokens']:,} / out {u['output_tokens']:,} · {llm.fmt_usd(u['cost_usd'])})")
    except (llm.LLMError, RuntimeError) as e:
        print(f"⛔ 중단: {e}\n   지금까지 {len(out)}건 저장됨. 설정을 고친 뒤 다시 실행하면 이어서 해요.")
        sys.exit(1)
    flagged = sorted(s for s, v in out.items() if v.get("needs_review"))
    print(f"✔ 초안 {len(out)}건 → data/draft/foods_draft.json  (이번 실행 {cfg.label}: 토큰 in {tin:,} / out {tout:,} · 약 {llm.fmt_usd(spent)})")
    if flagged:
        print(f"⚠ 검수 필요(스키마 오류) {len(flagged)}건: {', '.join(flagged[:10])}{' …' if len(flagged) > 10 else ''}"
              f"\n   → python s05_llm_draft.py --needs-review --smart 로 다시 만들거나, s07 검수 시트에서 확인하세요")


if __name__ == "__main__":
    main()
