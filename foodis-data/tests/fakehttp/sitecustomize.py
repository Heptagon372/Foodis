"""오프라인 테스트용: requests.Session.request 를 가짜 응답으로 교체 (실제 네트워크 호출 없음)."""
import hashlib, json, re
from urllib.parse import parse_qs, urlparse
import requests

def qid(title): return "Q" + str(int(hashlib.md5(title.encode()).hexdigest()[:6], 16))
MISSING = {"Pique macho"}          # 일부러 해석 실패 → 검색 fallback 경로 검증
ORIGIN_MISMATCH = {"Falafel": "EG"}  # 원산지 불일치 경고 경로 검증

class R:
    def __init__(self, obj, status=200):
        self.status_code, self.headers = status, {}
        self.content = b"" if obj is None else json.dumps(obj).encode()
    def json(self): return json.loads(self.content)
    def raise_for_status(self):
        if self.status_code >= 400: raise requests.HTTPError(self.status_code)

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

def route(method, url, params=None, json_body=None):
    u, p = urlparse(url), {k: v for k, v in (params or {}).items()}
    if "wikipedia.org/w/api.php" in url and p.get("list") == "search":
        return {"query": {"search": [{"title": "Pique a lo macho"}]}}
    if "wikipedia.org/w/api.php" in url:
        titles = p["titles"].split("|"); pages = []
        for t in titles:
            if t in MISSING: pages.append({"title": t, "missing": True}); continue
            pages.append({"title": t, "pageprops": {"wikibase_item": qid(t)}, "langlinks": [{"lang": "ko", "title": t + " (ko)"}] if hash(t) % 3 else []})
        return {"query": {"pages": pages}}
    if "query.wikidata.org" in url:
        qs = re.findall(r"wd:(Q\d+)", p["query"]); b = []
        for q in qs:
            b.append({"item": {"value": f"http://www.wikidata.org/entity/{q}"}, "labelEn": {"value": q}, "labelKo": {"value": q + "ko"},
                      "originCode": {"value": "XX"}, "image": {"value": f"http://commons.wikimedia.org/wiki/Special:FilePath/{q}%20dish.jpg"},
                      "materials": {"value": "rice|onion"}, "materialQids": {"value": "http://www.wikidata.org/entity/Q1|http://www.wikidata.org/entity/Q2"},
                      "instanceOf": {"value": "food"}})
        return {"results": {"bindings": b}}
    if "/api/rest_v1/page/summary/" in url:
        t = u.path.rsplit("/", 1)[-1]
        return {"type": "standard", "title": t, "extract": f"{t} extract.", "content_urls": {"desktop": {"page": f"https://{u.netloc}/wiki/{t}"}}}
    if "commons.wikimedia.org" in url:
        return {"query": {"pages": [{"title": t, "imageinfo": [{"thumburl": "https://upload.wikimedia.org/x.jpg", "descriptionurl": "https://commons.wikimedia.org/wiki/" + t,
                 "extmetadata": {"Artist": {"value": "<a>Someone</a>"}, "LicenseShortName": {"value": "CC BY-SA 4.0"}}}]} for t in p["titles"].split("|")]}}
    if "themealdb.com" in url:
        return {"meals": [{"idMeal": "1", "strMeal": p["s"], "strArea": "X", "strIngredient1": "Onion", "strIngredient2": ""}]} if p.get("s") in ("Injera", "Kimchi") else {"meals": None}
    if "api.anthropic.com" in url:
        return {"model": json_body["model"], "usage": {"input_tokens": 1200, "output_tokens": 600},
                "content": [{"type": "tool_use", "name": "save_food_draft", "input": draft_for(json_body["messages"][0]["content"])}]}
    if "api.openai.com/v1/embeddings" in url:
        return {"data": [{"embedding": [0.0] * 1536} for _ in json_body["input"]], "usage": {"total_tokens": 100 * len(json_body["input"])}}
    if "/rest/v1/" in url:
        if method == "GET":
            return [{"id": f"id-{s}", "slug": s} for s in json.load(open(FINAL, encoding="utf-8"))]
        if "food_embeddings" in url: return None
        return [{**r, "id": f"id-{r.get('slug') or r.get('code') or i}"} for i, r in enumerate(json_body)]
    raise AssertionError("unrouted " + url)

import os
FINAL = os.environ.get("FOODIS_TEST_FINAL", "")
def fake(self, method, url, params=None, data=None, json=None, headers=None, timeout=None, **kw):
    return R(route(method, url, params, json))
requests.Session.request = fake
