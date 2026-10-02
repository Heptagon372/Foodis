"""LLM 제공자 추상화 — 파이프라인에서 LLM 을 쓰는 곳(지금은 s05 초안)은 모두 여기를 거친다.

    data, usage = draft_json(system, user, schema, tier="draft")

- 제공자: DATA_LLM_PROVIDER = gemini(기본) | openai | anthropic(선택)
- 모델:   tier 별 기본값 (draft = 싸고 쓸 만한 모델, smart = 더 똑똑한 모델)
          DATA_LLM_MODEL(draft) · DATA_LLM_MODEL_SMART(smart) 로 덮어쓴다. anthropic 은 예전 LLM_MODEL_DRAFT 도 인정
- 요금제: DATA_LLM_SERVICE_TIER=flex (또는 s05 --flex) → Gemini·OpenAI 의 Flex 처리, 표준 요금의 50%. 느리고 가끔 503
- 생각량: DATA_LLM_EFFORT = low | medium | high (비우면 모델 기본값). Gemini thinkingLevel · OpenAI reasoning.effort
- 재시도: 429·5xx 는 common.Http 가 지수 백오프(Retry-After 준수). 스키마 위반이면 오류를 알려 주고 1회 다시 요청,
          그래도 틀리면 usage["needs_review"] 에 이유를 담아 돌려준다 → 사람이 검수
- 비용:   usage(토큰) × PRICES → 달러 추정. 생각(thinking/reasoning) 토큰은 출력 요금으로 청구된다

SDK 대신 REST 를 직접 부른다. common.Http(재시도·간격·타임아웃)와 tests/fakehttp 의 가짜 HTTP 를 그대로 쓰기 위해서이고,
요청 본문은 공식 SDK 가 실제로 보내는 필드와 같다 (확인일 2026-10-02):
- Gemini  generateContent + generationConfig.responseMimeType="application/json" + responseJsonSchema
          google-genai 2.27 README 의 generate_content(config={response_mime_type, response_json_schema}) 가 이 필드로 직렬화됨
          https://github.com/googleapis/python-genai (README "JSON Response Schema"), https://ai.google.dev/api/generate-content
          ※ 새 Interactions API(베타)는 쓰지 않는다 — 문서가 "안정적인 운영은 generateContent 권장"
            https://ai.google.dev/gemini-api/docs/interactions/structured-output
          ※ API 레퍼런스는 다음 단계로 generationConfig.responseFormat.text{mimeType, schema} 를 안내 중. 400 이 나면 그쪽으로 바꿀 것
- OpenAI  Responses API + text.format={type: json_schema, strict: true}
          https://developers.openai.com/api/docs/guides/structured-outputs
- Anthropic  tool_use 강제(tool_choice) — 기존 s05 방식 그대로
"""
from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import date
from typing import Any, Callable

import requests

from common import Http

PROVIDERS = ("gemini", "openai", "anthropic")
TIERS = ("draft", "smart")
KEY_ENV = {"gemini": "GEMINI_API_KEY", "openai": "OPENAI_API_KEY", "anthropic": "ANTHROPIC_API_KEY"}

# 기본 모델 (확인일 2026-10-02)
# - Gemini: https://ai.google.dev/gemini-api/docs/models — 3.5 Flash-Lite(안정, 2026-07), 3.8 Flash(안정, 2026-09, "가장 똑똑한 Flash")
# - OpenAI: https://developers.openai.com/api/docs/models — GPT-6 Luna("대량·비용 민감"), GPT-6.1 Sol("지능과 비용 균형")
# - Anthropic: https://platform.claude.com/docs/en/about-claude/pricing — Haiku 4.5 / Sonnet 5 (앱과 같은 모델)
DEFAULT_MODELS = {
    "gemini": {"draft": "gemini-3.5-flash-lite", "smart": "gemini-3.8-flash"},
    "openai": {"draft": "gpt-6-luna", "smart": "gpt-6.1-sol"},
    "anthropic": {"draft": "claude-haiku-4-5", "smart": "claude-sonnet-5"},
}

# 표준(Standard) 요금, USD / 100만 토큰 (입력, 출력). 출력에는 생각 토큰 포함. 확인일 2026-10-02
# Gemini https://ai.google.dev/gemini-api/docs/pricing · OpenAI https://developers.openai.com/api/docs/pricing
# Anthropic https://platform.claude.com/docs/en/about-claude/pricing
# Flex·Batch 는 세 곳 모두 표준의 50% (Anthropic 은 Batch 만, Flex 없음)
PRICES: dict[str, tuple[float, float]] = {
    "gemini-3.5-flash-lite": (0.30, 2.50),
    "gemini-3.1-flash-lite": (0.25, 1.50),
    "gemini-3.8-flash": (0.75, 3.75),
    "gemini-3.1-pro-preview": (2.00, 12.00),   # 20만 토큰 이하 프롬프트 기준
    "gpt-6-luna": (0.10, 0.50),
    "gpt-5.6-luna": (0.20, 1.20),
    "gpt-6.1-sol": (2.00, 10.00),
    "claude-haiku-4-5": (1.00, 5.00),
    "claude-sonnet-5": (2.00, 10.00),
    "claude-sonnet-5-5": (2.00, 10.00),
}
# 예고된 가격 변경: (적용 시작일, 새 가격). gemini-3.8-flash 는 2026-12-31 까지 할인가, 2027-01-01 부터 두 배
PRICE_CHANGES: dict[str, list[tuple[str, tuple[float, float]]]] = {
    "gemini-3.8-flash": [("2027-01-01", (1.50, 7.50))],
}
FLEX_DISCOUNT = 0.5

# 출력 상한 (생각 토큰 포함). 초안 JSON 은 1.5~2.5k 토큰이라 넉넉히 둔다 — 실제 쓴 만큼만 청구된다
MAX_OUTPUT_TOKENS = 16000
ANTHROPIC_MAX_TOKENS = 4096   # anthropic 경로는 생각(extended thinking)을 켜지 않는다
# 비용 추정용 가정: 보이는 출력 ~1.5k + 생각 ~1.5k (Gemini·OpenAI 기본 모델은 모두 생각하는 모델)
EST_OUTPUT_TOKENS = 1500
EST_THINKING_TOKENS = {"gemini": 1500, "openai": 1500, "anthropic": 0}

GEMINI_API = "https://generativelanguage.googleapis.com/v1beta"
OPENAI_API = "https://api.openai.com/v1"
ANTHROPIC_API = "https://api.anthropic.com/v1/messages"

RETRY_NOTE = """

<schema_errors>
{errors}
</schema_errors>
직전 답변이 위 이유로 JSON 스키마에 맞지 않았다. 같은 근거만 사용해 스키마에 정확히 맞는 JSON 으로 다시 작성하라."""


class LLMError(RuntimeError):
    """설정 오류(잘못된 모델명·스키마 거부 등 4xx) — 같은 설정으로 계속 부르면 돈만 쓰므로 실행을 멈춘다."""


@dataclass(frozen=True)
class Config:
    provider: str
    model: str
    tier: str = "draft"
    service_tier: str | None = None   # None(표준) | "flex"
    effort: str | None = None         # None(모델 기본) | low | medium | high

    @property
    def label(self) -> str:
        return f"{self.provider} · {self.model} ({self.tier}{', flex' if self.service_tier else ''})"


def resolve(tier: str = "draft", flex: bool | None = None) -> Config:
    """환경변수로 제공자·모델·요금제를 정한다. 잘못된 조합은 돈을 쓰기 전에 멈춘다."""
    if tier not in TIERS:
        raise ValueError(f"tier 는 {TIERS} 중 하나: {tier}")
    provider = (os.environ.get("DATA_LLM_PROVIDER") or "gemini").strip().lower()
    if provider not in PROVIDERS:
        raise SystemExit(f"DATA_LLM_PROVIDER={provider} 는 지원하지 않아요 ({' | '.join(PROVIDERS)})")
    model = os.environ.get("DATA_LLM_MODEL_SMART" if tier == "smart" else "DATA_LLM_MODEL", "").strip()
    if not model and provider == "anthropic" and tier == "draft":
        model = os.environ.get("LLM_MODEL_DRAFT", "").strip()  # 예전 .env 호환
    model = model or DEFAULT_MODELS[provider][tier]
    family = "gemini" if model.startswith("gemini") else "anthropic" if model.startswith("claude") else "openai"
    if family != provider:
        raise SystemExit(f"모델 {model} 은(는) {provider} 모델이 아니에요. DATA_LLM_PROVIDER 와 DATA_LLM_MODEL 을 맞추세요")
    st = (os.environ.get("DATA_LLM_SERVICE_TIER") or "").strip().lower() or None
    if flex:
        st = "flex"
    if st not in (None, "standard", "flex"):
        raise SystemExit(f"DATA_LLM_SERVICE_TIER={st} 는 standard | flex 만 돼요")
    st = None if st == "standard" else st
    if st == "flex" and provider == "anthropic":
        print("  ⚠ anthropic 은 Flex 처리가 없어 표준 요금으로 실행해요 (할인은 Batch API 만)")
        st = None
    effort = (os.environ.get("DATA_LLM_EFFORT") or "").strip().lower() or None
    if effort not in (None, "low", "medium", "high"):
        raise SystemExit(f"DATA_LLM_EFFORT={effort} 는 low | medium | high 만 돼요")
    return Config(provider, model, tier, st, effort)


# ───────────────────────── 비용

def price(model: str, today: date | None = None) -> tuple[float, float] | None:
    """표준 요금 (입력, 출력) USD/1M. DATA_LLM_PRICE="0.3,2.5" 로 가격표에 없는 모델을 지정할 수 있다."""
    env = (os.environ.get("DATA_LLM_PRICE") or "").strip()
    if env:
        a, b = (float(x) for x in env.split(","))
        return a, b
    p = PRICES.get(model)
    today = today or date.today()
    for since, newer in PRICE_CHANGES.get(model, []):
        if today >= date.fromisoformat(since):
            p = newer
    return p


def cost_usd(input_tokens: int, output_tokens: int, model: str, service_tier: str | None = None,
             today: date | None = None) -> float | None:
    p = price(model, today)
    if not p:
        return None
    mult = FLEX_DISCOUNT if service_tier == "flex" else 1.0
    return (input_tokens * p[0] + output_tokens * p[1]) / 1_000_000 * mult


def estimate_tokens(text: str) -> int:
    """대략적인 토큰 수. 영문은 ~3.5자/토큰, 한글 등은 ~1.2자/토큰으로 넉넉하게 잡는다 (돈 쓰기 전 추정용)."""
    ascii_n = sum(1 for ch in text if ord(ch) < 128)
    return int(ascii_n / 3.5 + (len(text) - ascii_n) / 1.2) + 1


def estimate(cfg: Config, input_tokens: list[int]) -> dict[str, Any]:
    """건별 입력 토큰 추정치 목록 → 전체 비용 추정."""
    n = len(input_tokens)
    out_each = EST_OUTPUT_TOKENS + EST_THINKING_TOKENS[cfg.provider]
    tin, tout = sum(input_tokens), out_each * n
    return {"n": n, "avg_in": (tin // n) if n else 0, "out_each": out_each, "input_tokens": tin, "output_tokens": tout,
            "price": price(cfg.model), "usd": cost_usd(tin, tout, cfg.model, cfg.service_tier)}


# ───────────────────────── 스키마

def validate(obj: Any, schema: dict) -> list[str]:
    """JSON Schema 검증 오류 목록 (최대 8개). 비어 있으면 통과."""
    try:
        from jsonschema import Draft202012Validator
    except ImportError:
        raise SystemExit("jsonschema 가 없어요 → pip install -r requirements.txt (s05 스키마 검증에 필요)") from None

    errs = sorted(Draft202012Validator(schema).iter_errors(obj), key=lambda e: [str(p) for p in e.absolute_path])
    out = []
    for e in errs[:8]:
        where = "/".join(str(p) for p in e.absolute_path) or "(최상위)"
        msg = e.message if len(e.message) <= 200 else e.message[:200] + "…"
        out.append(f"{where}: {msg}")
    return out


_UNPORTABLE = ("oneOf", "allOf", "not", "if", "then", "else", "$ref", "patternProperties", "dependentRequired")


def portable_problems(schema: dict, path: str = "$") -> list[str]:
    """세 제공자에 그대로 보낼 수 있는 부분집합인지 확인.
    OpenAI strict: 모든 object 에 additionalProperties:false, 모든 속성이 required, 루트는 object.
    Gemini: 지원 키워드 목록 밖(oneOf 는 anyOf 로 해석, allOf/not/if 등 미지원)은 쓰지 않는다."""
    probs = []
    if path == "$" and schema.get("type") != "object":
        probs.append("$: 루트는 object 여야 함")
    for k in _UNPORTABLE:
        if k in schema:
            probs.append(f"{path}: {k} 사용 금지")
    types = schema.get("type")
    if types == "object" or (isinstance(types, list) and "object" in types):
        props = schema.get("properties") or {}
        if schema.get("additionalProperties") is not False:
            probs.append(f"{path}: additionalProperties:false 필요")
        missing = set(props) - set(schema.get("required") or [])
        if missing:
            probs.append(f"{path}: required 에 빠진 속성 {sorted(missing)}")
        for name, sub in props.items():
            probs += portable_problems(sub, f"{path}.{name}")
    if isinstance(schema.get("items"), dict):
        probs += portable_problems(schema["items"], f"{path}[]")
    for i, sub in enumerate(schema.get("anyOf") or []):
        probs += portable_problems(sub, f"{path}|{i}")
    return probs


# ───────────────────────── 제공자별 호출

@dataclass
class Raw:
    text: str | None          # 모델이 쓴 JSON 문자열 (anthropic 은 None, data 로 바로 옴)
    data: Any                 # 이미 구조화된 결과 (anthropic tool_use input)
    usage: dict[str, int]
    stop: str | None          # 종료 사유 (STOP · MAX_TOKENS · SAFETY · refusal …)
    model: str | None


def _post(http: Http, cfg: Config, url: str, body: dict, headers: dict) -> dict:
    """LLM 요청: 캐시 없음(재시도가 의미 있도록), Flex 는 대기열이 길어 타임아웃 15분."""
    flex = cfg.service_tier == "flex"
    try:
        return http.post(url, json_body=body, headers=headers, cache=False,
                         retries=8 if flex else 6, timeout=900 if flex else 300)
    except requests.HTTPError as e:
        resp = getattr(e, "response", None)
        status = getattr(resp, "status_code", None) or (e.args[0] if e.args else "?")
        detail = (resp.text or "")[:400] if resp is not None else ""
        # 401 본문에 키 일부(sk-…abcd)가 들어오는 경우가 있어 화면·로그에 남기지 않는다
        for h in ("x-goog-api-key", "x-api-key", "Authorization"):
            secret = (headers.get(h) or "").removeprefix("Bearer ")
            detail = detail.replace(secret, "[키]") if len(secret) > 8 else detail
        detail = re.sub(r"\b(sk-|AIza)[\w\-*.]+", "[키]", detail)
        raise LLMError(f"{cfg.provider} {cfg.model} 요청 거부 ({status}) {detail}".strip()) from None


def _gemini(http: Http, cfg: Config, key: str, system: str, user: str, schema: dict, name: str) -> Raw:
    gen: dict[str, Any] = {"responseMimeType": "application/json", "responseJsonSchema": schema, "maxOutputTokens": MAX_OUTPUT_TOKENS}
    if cfg.effort:
        gen["thinkingConfig"] = {"thinkingLevel": cfg.effort.upper()}  # 3.8 Flash 는 minimal 미지원이라 low 부터
    body: dict[str, Any] = {"systemInstruction": {"parts": [{"text": system}]},
                            "contents": [{"role": "user", "parts": [{"text": user}]}], "generationConfig": gen}
    if cfg.service_tier:
        body["serviceTier"] = cfg.service_tier
    res = _post(http, cfg, f"{GEMINI_API}/models/{cfg.model}:generateContent", body, {"x-goog-api-key": key})
    cand = (res.get("candidates") or [{}])[0]
    parts = (cand.get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
    um = res.get("usageMetadata") or {}
    think = um.get("thoughtsTokenCount", 0)
    stop = cand.get("finishReason") or (res.get("promptFeedback") or {}).get("blockReason")
    return Raw(text, None, {"input_tokens": um.get("promptTokenCount", 0), "output_tokens": um.get("candidatesTokenCount", 0) + think,
                            "thinking_tokens": think}, stop, res.get("modelVersion"))


def _openai(http: Http, cfg: Config, key: str, system: str, user: str, schema: dict, name: str) -> Raw:
    body: dict[str, Any] = {"model": cfg.model, "instructions": system, "input": user, "max_output_tokens": MAX_OUTPUT_TOKENS,
                            "store": False, "text": {"format": {"type": "json_schema", "name": name, "schema": schema, "strict": True}}}
    if cfg.effort:
        body["reasoning"] = {"effort": cfg.effort}
    if cfg.service_tier:
        body["service_tier"] = cfg.service_tier
    res = _post(http, cfg, f"{OPENAI_API}/responses", body, {"Authorization": f"Bearer {key}"})
    texts, refusal = [], None
    for item in res.get("output") or []:
        if item.get("type") != "message":
            continue
        for c in item.get("content") or []:
            if c.get("type") == "output_text":
                texts.append(c.get("text", ""))
            elif c.get("type") == "refusal":
                refusal = c.get("refusal")
    u = res.get("usage") or {}
    stop = f"refusal: {refusal}" if refusal else ((res.get("incomplete_details") or {}).get("reason") or res.get("status"))
    return Raw("".join(texts), None, {"input_tokens": u.get("input_tokens", 0), "output_tokens": u.get("output_tokens", 0),
                                      "thinking_tokens": (u.get("output_tokens_details") or {}).get("reasoning_tokens", 0)},
               stop, res.get("model"))


def _anthropic(http: Http, cfg: Config, key: str, system: str, user: str, schema: dict, name: str) -> Raw:
    # Sonnet 5 계열은 temperature 미지원(400) → 보내지 않음. 생각(effort)도 켜지 않는다
    body = {"model": cfg.model, "max_tokens": ANTHROPIC_MAX_TOKENS, "system": system,
            "tools": [{"name": name, "description": "근거 자료만으로 작성한 결과를 저장한다.", "input_schema": schema}],
            "tool_choice": {"type": "tool", "name": name}, "messages": [{"role": "user", "content": user}]}
    res = _post(http, cfg, ANTHROPIC_API, body, {"x-api-key": key, "anthropic-version": "2023-06-01"})
    block = next((b for b in res.get("content") or [] if b.get("type") == "tool_use"), None)
    u = res.get("usage") or {}
    return Raw(None, block.get("input") if block else None,
               {"input_tokens": u.get("input_tokens", 0), "output_tokens": u.get("output_tokens", 0), "thinking_tokens": 0},
               res.get("stop_reason"), res.get("model"))


CALLS: dict[str, Callable[..., Raw]] = {"gemini": _gemini, "openai": _openai, "anthropic": _anthropic}


def _parse(raw: Raw, schema: dict) -> tuple[Any, list[str]]:
    if raw.text is None:
        data = raw.data
        if data is None:
            return {}, [f"구조화된 답 없음 (종료 사유 {raw.stop})"]
    else:
        if not raw.text.strip():
            return {}, [f"빈 응답 (종료 사유 {raw.stop})"]
        try:
            data = json.loads(raw.text)
        except json.JSONDecodeError as e:
            return {}, [f"JSON 해석 실패 (종료 사유 {raw.stop}): {e}"]
    if not isinstance(data, dict):
        return {}, [f"JSON 객체가 아님: {type(data).__name__}"]
    return data, validate(data, schema)


_HTTP: Http | None = None


def _default_http() -> Http:
    """LLM 호출용 세션 하나를 계속 쓴다 (디스크 캐시 없음 — 같은 요청이라도 매번 새로 생성)."""
    global _HTTP
    if _HTTP is None:
        _HTTP = Http(min_interval=0.2, cache_dir=None)
    return _HTTP


def draft_json(system: str, user: str, schema: dict, tier: str = "draft", *, name: str = "output",
               cfg: Config | None = None, http: Http | None = None) -> tuple[dict, dict]:
    """근거(user)로 schema 에 맞는 JSON 을 받는다.
    반환: (data, usage) — usage = {provider, model, tier, service_tier, input_tokens, output_tokens, thinking_tokens,
    cost_usd, attempts, needs_review}. needs_review 가 비어 있지 않으면 2번 모두 스키마 위반 → 사람이 확인해야 한다."""
    cfg = cfg or resolve(tier)
    key = os.environ.get(KEY_ENV[cfg.provider])
    if not key:
        raise SystemExit(f".env 에 {KEY_ENV[cfg.provider]} 를 설정하세요 (DATA_LLM_PROVIDER={cfg.provider})")
    http = http or _default_http()
    total ={"input_tokens": 0, "output_tokens": 0, "thinking_tokens": 0}
    prompt, data, errors, model_seen, attempt = user, {}, [], cfg.model, 0
    for attempt in (1, 2):
        raw = CALLS[cfg.provider](http, cfg, key, system, prompt, schema, name)
        for k in total:
            total[k] += int(raw.usage.get(k) or 0)
        model_seen = raw.model or model_seen
        data, errors = _parse(raw, schema)
        if not errors:
            break
        if attempt == 1:
            print(f"    ↻ 스키마 오류 {len(errors)}개 → 오류를 알려 주고 1회 다시 요청 ({errors[0][:80]})")
            prompt = user + RETRY_NOTE.format(errors="\n".join(f"- {e}" for e in errors))
    usage = {"provider": cfg.provider, "model": model_seen, "tier": cfg.tier, "service_tier": cfg.service_tier or "standard",
             **total, "cost_usd": cost_usd(total["input_tokens"], total["output_tokens"], cfg.model, cfg.service_tier),
             "attempts": attempt, "needs_review": errors}
    return data, usage


def fmt_usd(v: float | None) -> str:
    return "가격 미상" if v is None else (f"${v:,.2f}" if v >= 0.1 else f"${v:.4f}")


if __name__ == "__main__":  # 현재 설정 확인용: python llm.py
    c = resolve()
    print(f"draft: {c.label}  가격 {price(c.model)}\nsmart: {resolve('smart').label}  가격 {price(resolve('smart').model)}")
    print(f"키 {KEY_ENV[c.provider]}: {'설정됨' if os.environ.get(KEY_ENV[c.provider]) else '없음'}", file=sys.stderr)
