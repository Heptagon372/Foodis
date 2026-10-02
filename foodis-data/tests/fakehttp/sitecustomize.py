"""오프라인 테스트용: requests.Session.request 를 가짜 응답으로 교체 (실제 네트워크 호출 없음)."""
import hashlib, json, os, re
import json as _json   # fake() 의 json= 인자가 모듈 이름을 가리므로 별칭
from urllib.parse import parse_qs, urlparse
import requests

# LLM 출력 이상 상황 (음식 영문명, 쉼표 구분): 첫 시도만 스키마 위반 / 두 번 다 위반(→ needs_review)
INVALID_ONCE = set(filter(None, os.environ.get("FAKE_LLM_INVALID_ONCE", "").split(",")))
INVALID_ALWAYS = set(filter(None, os.environ.get("FAKE_LLM_INVALID_ALWAYS", "").split(",")))
STATE = {"429": os.environ.get("FAKE_429_ONCE") == "1"}

def qid(title): return "Q" + str(int(hashlib.md5(title.encode()).hexdigest()[:6], 16))
MISSING = {"Pique macho"}          # 일부러 해석 실패 → 검색 fallback 경로 검증
ORIGIN_MISMATCH = {"Falafel": "EG"}  # 원산지 불일치 경고 경로 검증
# 이미지 경로 검증: P18 없음 → 문서 대표 이미지(pageimage), 자유 라이선스가 아닌 파일은 거절
NO_P18 = {qid(t) for t in ("Yomari", "Khorovats", "Matapa")}
P18_FILE = {qid("Poutine"): "GFDL%20photo.jpg"}                       # P18 이 GFDL 단독 → 거절 → pageimage
PAGEIMAGE = {"Yomari": "Yomari_double.jpg", "Poutine": "Poutine_in_Montreal.jpg",
             "Khorovats": "Khorovats_NC.jpg",                          # CC BY-NC → 거절
             "Matapa": "Matapa_fairuse.jpg"}                           # 공용에 없는 로컬 파일 → 거절
def commons_license(t):
    return "GFDL 1.2" if "GFDL" in t else ("CC BY-NC-SA 4.0" if " NC" in t else "CC BY-SA 4.0")

class R:
    def __init__(self, obj, status=200, headers=None):
        self.status_code, self.headers = status, headers or {}
        self.content = b"" if obj is None else json.dumps(obj).encode()
    @property
    def text(self): return self.content.decode()
    def json(self): return json.loads(self.content)
    def raise_for_status(self):
        if self.status_code >= 400: raise requests.HTTPError(self.status_code, response=self)

def draft_for(text):
    name = re.search(r"name_en='([^']+)'", text).group(1)
    meat = any(w in name.lower() for w in ("chicken", "duck", "kebab", "bulgogi", "schnitzel", "asado", "shashlik", "lechon", "satay", "gyros"))
    pork = "lechon" in name.lower() or "jam" in name.lower()
    ings = [{"name_en": "Rice" if "rice" in name.lower() else "Wheat flour", "name_ko": "쌀" if "rice" in name.lower() else "밀가루", "role": "main",
             "category": "grain", "animal_origin": False, "pork": False, "allergen": None if "rice" in name.lower() else "wheat"},
            {"name_en": "Chickpea" if name in ("Falafel", "Hummus", "Chana masala", "Koshary") else "Onion", "name_ko": "병아리콩" if name in ("Falafel", "Hummus", "Chana masala", "Koshary") else "양파",
             "role": "main", "category": "legume", "animal_origin": False, "pork": False, "allergen": None}]
    if meat:
        ings.append({"name_en": "Pork" if pork else "Chicken", "name_ko": "돼지고기" if pork else "닭고기", "role": "main", "category": "meat", "animal_origin": True, "pork": pork, "allergen": None})
    if name == "Kimchi":
        ings.append({"name_en": "Fish sauce", "name_ko": "액젓", "role": "seasoning", "category": "seafood", "animal_origin": True, "pork": False, "allergen": "fish"})
    return {"summary": f"{name} 요약 문장.", "history": None if name == "Genfo" else "역사 문장.", "culture_story": None if name == "Genfo" else "문화 이야기.",
            "cooking_method": "fermented" if name in ("Kimchi", "Injera", "Tempeh") else ("grilled" if meat else "boiled"),
            "taste_tags": ["spicy", "fermented"] if name in ("Kimchi", "Injera") else (["meat", "grilled", "smoky"] if meat else ["vegetable", "fresh"]),
            "course_type": "main", "name_local": None, "ingredients": ings,
            "diet_draft": {"vegan": "yes" if name == "Kimchi" else ("no" if meat else "depends"), "vegetarian": "no" if meat else "yes",
                           "halal": "no" if pork else ("depends" if meat else "yes"), "gluten_free": "no", "dairy_free": "yes", "reason": "테스트"},
            "allergens": ["wheat"], "used_evidence": ["wikipedia_en", "wikidata"]}

def llm_text(user):
    """LLM 이 돌려줄 JSON 문자열. 재요청(스키마 오류 안내 포함)인지 보고 이상 상황을 흉내 낸다."""
    name = re.search(r"name_en='([^']+)'", user).group(1)
    retry = "<schema_errors>" in user
    d = draft_for(user)
    if name in INVALID_ALWAYS:
        if not retry:
            return "죄송해요, JSON 대신 문장으로 답할게요."          # JSON 해석 실패
        d.update(taste_tags=["spicy"], cooking_method="microwaved")   # 재요청도 스키마 위반 (minItems · enum)
    elif name in INVALID_ONCE and not retry:
        d["taste_tags"] = d["taste_tags"][:1]                          # minItems 2 위반 → 재요청에서 고쳐짐
    return json.dumps(d, ensure_ascii=False)

def route(method, url, params=None, json_body=None):
    u, p = urlparse(url), {k: v for k, v in (params or {}).items()}
    if "wikipedia.org/w/api.php" in url and p.get("list") == "search":
        return {"query": {"search": [{"title": "Pique a lo macho"}]}}
    if "wikipedia.org/w/api.php" in url and p.get("prop") == "pageimages":
        t = p["titles"]
        return {"query": {"pages": [{"title": t, **({"pageimage": PAGEIMAGE[t]} if t in PAGEIMAGE else {})}]}}
    if "wikipedia.org/w/api.php" in url:
        titles = p["titles"].split("|"); pages = []
        for t in titles:
            if t in MISSING: pages.append({"title": t, "missing": True}); continue
            pages.append({"title": t, "pageprops": {"wikibase_item": qid(t)}, "langlinks": [{"lang": "ko", "title": t + " (ko)"}] if hash(t) % 3 else []})
        return {"query": {"pages": pages}}
    if "query.wikidata.org" in url:
        qs = re.findall(r"wd:(Q\d+)", p["query"]); b = []
        for q in qs:
            img = {} if q in NO_P18 else {"image": {"value": "http://commons.wikimedia.org/wiki/Special:FilePath/" + P18_FILE.get(q, f"{q}%20dish.jpg")}}
            b.append({"item": {"value": f"http://www.wikidata.org/entity/{q}"}, "labelEn": {"value": q}, "labelKo": {"value": q + "ko"},
                      "originCode": {"value": "XX"}, **img,
                      "materials": {"value": "rice|onion"}, "materialQids": {"value": "http://www.wikidata.org/entity/Q1|http://www.wikidata.org/entity/Q2"},
                      "instanceOf": {"value": "food"}})
        return {"results": {"bindings": b}}
    if "/api/rest_v1/page/summary/" in url:
        t = u.path.rsplit("/", 1)[-1]
        return {"type": "standard", "title": t, "extract": f"{t} extract.", "content_urls": {"desktop": {"page": f"https://{u.netloc}/wiki/{t}"}}}
    if "commons.wikimedia.org" in url:
        return {"query": {"pages": [{"title": t, "missing": True} if "fairuse" in t else
                {"title": t, "imageinfo": [{"thumburl": "https://upload.wikimedia.org/x.jpg", "descriptionurl": "https://commons.wikimedia.org/wiki/" + t,
                 "extmetadata": {"Artist": {"value": "<a>Someone</a>"}, "LicenseShortName": {"value": commons_license(t)}}}]} for t in p["titles"].split("|")]}}
    if "themealdb.com" in url:
        return {"meals": [{"idMeal": "1", "strMeal": p["s"], "strArea": "X", "strIngredient1": "Onion", "strIngredient2": ""}]} if p.get("s") in ("Injera", "Kimchi") else {"meals": None}
    # ── LLM 3사 (s05 → scripts/llm.py). 요청 모양이 공식 문서와 다르면 여기서 바로 실패시킨다
    m = re.search(r"generativelanguage\.googleapis\.com/v1beta/models/([^:/]+):generateContent$", url)
    if m:
        if STATE["429"]:   # 첫 호출만 429 → common.Http 재시도 경로 확인 (Gemini 는 헤더 대신 본문 RetryInfo 로 대기 시간을 준다)
            STATE["429"] = False
            return R({"error": {"code": 429, "status": "RESOURCE_EXHAUSTED",
                                "details": [{"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "0s"}]}}, 429)
        gc = json_body["generationConfig"]
        assert gc["responseMimeType"] == "application/json" and gc["responseJsonSchema"]["type"] == "object", gc
        assert "tools" not in json_body and json_body["systemInstruction"]["parts"][0]["text"]
        return {"modelVersion": m.group(1), "candidates": [{"content": {"role": "model", "parts": [{"text": llm_text(json_body["contents"][0]["parts"][0]["text"])}]},
                                                            "finishReason": "STOP"}],
                "usageMetadata": {"promptTokenCount": 1200, "candidatesTokenCount": 600, "thoughtsTokenCount": 150, "totalTokenCount": 1950}}
    if url == "https://api.openai.com/v1/responses":
        if json_body["model"] == "gpt-bad-key":   # 4xx → 재시도 없이 중단, 본문의 키 조각은 가려져야 한다
            return R({"error": {"message": "Incorrect API key provided: sk-proj-ab12****wxyz.", "type": "invalid_request_error"}}, 401)
        fmt = json_body["text"]["format"]
        assert fmt["type"] == "json_schema" and fmt["strict"] is True and fmt["schema"]["additionalProperties"] is False, fmt
        return {"id": "resp_fake", "object": "response", "status": "completed", "model": json_body["model"],
                "output": [{"type": "reasoning", "id": "rs_1", "summary": []},
                           {"type": "message", "id": "msg_1", "role": "assistant", "status": "completed",
                            "content": [{"type": "output_text", "text": llm_text(json_body["input"]), "annotations": []}]}],
                "usage": {"input_tokens": 1200, "output_tokens": 750, "output_tokens_details": {"reasoning_tokens": 150}, "total_tokens": 1950}}
    if "api.anthropic.com" in url:
        text = llm_text(json_body["messages"][0]["content"])
        try:
            block = {"type": "tool_use", "name": json_body["tool_choice"]["name"], "input": json.loads(text)}
        except ValueError:
            block = {"type": "text", "text": text}   # 도구를 안 쓰고 말로 답한 경우
        return {"model": json_body["model"], "usage": {"input_tokens": 1200, "output_tokens": 600}, "stop_reason": "tool_use", "content": [block]}
    m = re.search(r"generativelanguage\.googleapis\.com/v1beta/models/([^:/]+):batchEmbedContents$", url)
    if m:   # 정규화되지 않은 값을 돌려줘 s09 의 L2 정규화를 확인한다
        out = []
        for r in json_body["requests"]:
            assert r["model"] == f"models/{m.group(1)}" and r["content"]["parts"][0]["text"], r
            out.append({"values": [((j % 7) - 3) * 0.5 + 0.25 for j in range(r.get("outputDimensionality", 3072))]})
        return {"embeddings": out, "usageMetadata": {"promptTokenCount": 100 * len(out)}}
    if "api.openai.com/v1/embeddings" in url:
        return {"data": [{"embedding": [0.0] * 1536} for _ in json_body["input"]], "usage": {"total_tokens": 100 * len(json_body["input"])}}
    if "/rest/v1/" in url:
        if method == "GET":
            return [{"id": f"id-{s}", "slug": s} for s in json.load(open(FINAL, encoding="utf-8"))]
        if "food_embeddings" in url: return None
        return [{**r, "id": f"id-{r.get('slug') or r.get('code') or i}"} for i, r in enumerate(json_body)]
    raise AssertionError("unrouted " + url)

FINAL = os.environ.get("FOODIS_TEST_FINAL", "")
RECORD = os.environ.get("FOODIS_TEST_RECORD", "")   # 요청을 JSON Lines 로 기록 (헤더는 이름만 — 값은 남기지 않는다)
def fake(self, method, url, params=None, data=None, json=None, headers=None, timeout=None, **kw):
    if RECORD:
        with open(RECORD, "a", encoding="utf-8") as f:
            f.write(_json.dumps({"method": method, "url": url, "json": json, "headers": sorted(headers or {}), "timeout": timeout}, ensure_ascii=False) + "\n")
    out = route(method, url, params, json)
    return out if isinstance(out, R) else R(out)
requests.Session.request = fake
