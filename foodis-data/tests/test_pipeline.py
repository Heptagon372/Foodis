"""전체 파이프라인 오프라인 E2E 테스트: 임시 폴더에 키트를 복사하고 가짜 HTTP로 s01~s09 를 실제 실행한다.
LLM(s05)은 Gemini(기본) · OpenAI · Anthropic 세 경로 모두, 임베딩(s09)은 OpenAI · Gemini 두 경로를 가짜 HTTP 로 확인한다."""
import csv, json, math, os, shutil, subprocess, sys
from datetime import date
from pathlib import Path

import pytest

KIT = Path(__file__).resolve().parents[1]
# 개발자 셸에 남아 있는 설정이 테스트 결과를 바꾸지 않도록 지운다
_SCRUB = ("DATA_LLM_", "DATA_EMBED_", "EMBED_PROVIDER", "EMBEDDING_MODEL", "LLM_MODEL_DRAFT", "FAKE_", "FOODIS_TEST_RECORD")

def run(tmp, *args, env_extra=None, code=0):
    base = {k: v for k, v in os.environ.items() if not k.startswith(_SCRUB)}
    env = {**base, "PYTHONPATH": str(KIT / "tests" / "fakehttp"), "ANTHROPIC_API_KEY": "x", "OPENAI_API_KEY": "x", "GEMINI_API_KEY": "x",
           "FOODIS_HTTP_INTERVAL": "0", "SUPABASE_URL": "https://fake.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "x",
           "FOODIS_TEST_FINAL": str(tmp / "data/final/foods_final.json"), **(env_extra or {})}
    r = subprocess.run([sys.executable, *args], cwd=tmp / "scripts", env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
    assert r.returncode == code, r.stdout + r.stderr
    return r.stdout + r.stderr

def copy_kit(tmp_path):
    tmp = tmp_path / "kit"
    shutil.copytree(KIT, tmp, ignore=shutil.ignore_patterns("tests", "__pycache__", "*.json", ".env", ".venv", ".pytest_cache"))
    (tmp / "data/raw").mkdir(parents=True, exist_ok=True)
    return tmp

def mini_kit(tmp_path, slugs=("kimchi", "mandu", "injera", "bibimbap")):
    """s05 만 돌릴 수 있게 근거 자료(위키백과 요약)를 몇 건만 직접 만든 키트."""
    tmp = copy_kit(tmp_path)
    wp = {s: {"en": {"extract": f"{s} is a dish.", "url": f"https://en.wikipedia.org/wiki/{s}"}} for s in slugs}
    (tmp / "data/raw/wikipedia.json").write_text(json.dumps(wp), encoding="utf-8")
    return tmp

def drafts_of(tmp):
    return json.loads((tmp / "data/draft/foods_draft.json").read_text(encoding="utf-8"))

def recorded(path, part):
    return [r for r in map(json.loads, path.read_text(encoding="utf-8").splitlines()) if part in r["url"]] if path.exists() else []

def make_xlsx(path):
    from openpyxl import Workbook
    wb = Workbook(); ws = wb.active
    ws.append(["번호", "한글 메뉴명", "영문 표기", "국문 설명", "영문 설명"])
    ws.append([1, "김치", "Kimchi", "배추 발효 음식", "Fermented cabbage"])
    ws.append([2, "비빔밥", "Bibimbap", "비벼 먹는 밥", "Mixed rice"])
    wb.save(path)

def test_full_pipeline(tmp_path):
    tmp = copy_kit(tmp_path); make_xlsx(tmp / "data/raw/hansik800.xlsx")

    n = sum(1 for _ in csv.DictReader(open(KIT / "data/seed/dish_targets.csv", encoding="utf-8")))  # 시드 음식 수 (국가를 늘리면 같이 늘어난다)
    out = run(tmp, "s01_wikidata.py"); print(out)
    wd = json.loads((tmp / "data/raw/wikidata.json").read_text(encoding="utf-8"))
    assert len(wd) == n and "needs_review" in wd["pique-a-lo-macho"]
    assert all(v.get("origin_mismatch") for v in wd.values())  # 가짜 원산지 XX → 모두 불일치 경고

    # 이미지 교체 지정: 무무는 자유 라이선스 파일로 교체, 부렉은 NC 파일이라 거절 → P18 유지
    (tmp / "data/seed/image_overrides.csv").write_text(
        "slug,commons_file,reason\nmumu,Mumu PNG.jpg,파푸아뉴기니 무무 사진\nburek,Burek NC.jpg,비자유 라이선스 거절 확인\n", encoding="utf-8")
    out = run(tmp, "s02_wikipedia.py"); print(out); wp = json.loads((tmp / "data/raw/wikipedia.json").read_text(encoding="utf-8"))
    assert wp["kimchi"]["en"]["extract"] and wp["kimchi"]["image"]["license"] == "CC BY-SA 4.0" and wp["kimchi"]["image"]["artist"] == "Someone"
    assert wp["kimchi"]["image"]["source"] == "p18"
    img = lambda s: wp[s]["image"] or {}
    assert img("yomari")["source"] == "pageimage" and img("yomari")["file"] == "Yomari double.jpg" and img("yomari")["article"] == "en:Yomari"
    assert img("poutine")["source"] == "pageimage" and img("poutine")["file"] == "Poutine in Montreal.jpg"  # P18 GFDL 단독 → 거절
    assert wp["khorovats"]["image"] is None and wp["matapa"]["image"] is None  # NC 라이선스 · 공용에 없는 로컬 파일 → 거절
    assert img("mumu")["source"] == "override" and img("mumu")["file"] == "Mumu PNG.jpg" and img("mumu")["reason"]
    assert img("burek")["source"] == "p18" and "NC" not in img("burek")["license"]
    assert "Burek NC.jpg" in out and "CC BY-NC-SA 4.0" in out and "이미지 없음 2건" in out

    # 사진 보강: s02 가 못 찾은 코로바츠 → 공용 검색(지도 SVG 는 버림), 마타파 → Openverse(Flickr), 나머지 맞는 사진 · 교체 지정은 그대로
    out = run(tmp, "s02b_images.py"); print(out); wp = json.loads((tmp / "data/raw/wikipedia.json").read_text(encoding="utf-8"))
    k, m = wp["khorovats"]["image"], wp["matapa"]["image"]
    assert k["source"] == "commons_search" and k["file"] == "Khorovats on the grill.jpg" and k["fit"] == 1.0
    assert m["source"] == "openverse" and m["provider"] == "flickr" and m["license"] == "CC BY 2.0" and m["artist"] == "Traveler" and m["page"].startswith("https://www.flickr.com/")
    assert wp["kimchi"]["image"]["source"] == "p18" and wp["yomari"]["image"]["source"] == "pageimage" and wp["mumu"]["image"]["source"] == "override"
    report = json.loads((tmp / "data/raw/image_report.json").read_text(encoding="utf-8"))
    assert set(report) == {"khorovats", "matapa"}

    run(tmp, "s03_themealdb.py"); assert set(json.loads((tmp / "data/raw/themealdb.json").read_text(encoding="utf-8"))) == {"kimchi", "injera"}
    run(tmp, "s04_hansik800.py"); hs = json.loads((tmp / "data/raw/hansik800.json").read_text(encoding="utf-8"))
    assert hs["kimchi"]["name_en_std"] == "Kimchi" and hs["bibimbap"]["desc_en"] == "Mixed rice"

    # s05: 전체 실행은 --yes 가 있어야 돈을 쓴다. 없으면 추정만 보여 주고 멈춤(종료 코드 2)
    out = run(tmp, "s05_llm_draft.py", code=2); assert "--yes" in out and f"대상 {n}건" in out
    out = run(tmp, "s05_llm_draft.py", "--dry-run"); print(out)
    assert "gemini-3.5-flash-lite" in out and "gpt-6-luna" in out and "claude-haiku-4-5" in out and "$" in out
    assert not (tmp / "data/draft/foods_draft.json").exists()
    # 기본 제공자 = Gemini. 첫 호출 429 → 재시도, 비빔밥은 첫 답이 스키마 위반 → 오류 안내 후 1회 재요청으로 통과
    out = run(tmp, "s05_llm_draft.py", "--yes", env_extra={"FAKE_429_ONCE": "1", "FAKE_LLM_INVALID_ONCE": "Bibimbap"}); print(out[-600:])
    assert f"초안 {n}건" in out and "스키마 오류" in out and "검수 필요" not in out
    assert "↻ 429" in out and "0s 후 재시도" in out                     # Gemini 본문의 retryDelay 를 따른다 (백오프 1s 아님)
    dr = drafts_of(tmp)
    assert dr["kimchi"]["provider"] == "gemini" and dr["kimchi"]["model"] == "gemini-3.5-flash-lite" and dr["kimchi"]["usage"]["output_tokens"] == 750
    assert dr["bibimbap"]["usage"]["attempts"] == 2 and "needs_review" not in dr["bibimbap"] and len(dr["bibimbap"]["draft"]["taste_tags"]) >= 2
    out = run(tmp, "s05_llm_draft.py", "--yes"); assert "대상 0건" in out   # 이어서 실행: 남은 것 없음
    out = run(tmp, "s06_relations.py"); print(out)
    rels = json.loads((tmp / "data/draft/relations_draft.json").read_text(encoding="utf-8"))
    assert any(r["type"] == "historical_link" and {r["from"], r["to"]} == {"mandu", "pierogi"} for r in rels)
    assert any(r["type"] == "shares_ingredient" and {r["from"], r["to"]} == {"falafel", "chana-masala"} for r in rels)
    assert not any("wheat flour" in r["description"] for r in rels)   # 흔한 재료는 관계 근거에서 제외
    assert len(rels) < 3 * n                                          # 유형별 상한으로 검수 가능한 규모 유지 (음식 수에 비례)

    out = run(tmp, "s07_review.py", "export"); print(out)
    sheet = list(csv.DictReader(open(tmp / "data/draft/review_sheet.csv", encoding="utf-8-sig")))
    assert sheet[0]["demo_required"] == "Y"
    kimchi = next(r for r in sheet if r["slug"] == "kimchi"); assert "vegan=yes 인데 동물성 재료" in kimchi["auto_flags"]

    # 검수자 흉내: 전부 승인, 김치는 모순 그대로(차단돼야), 인제라는 출처 1개로 yes(강등돼야), 팔라펠은 출처 2개로 yes
    for r in sheet:
        r["approve"] = "Y"
        for k in ("vegan", "vegetarian", "halal", "gluten_free", "dairy_free"):
            r[f"final_{k}"] = r[f"draft_{k}"] if r["slug"] == "kimchi" else "depends"
    next(r for r in sheet if r["slug"] == "kimchi").update(diet_sources="https://a.example https://b.example")  # 출처 2개여도 재료 모순이면 차단
    next(r for r in sheet if r["slug"] == "bibimbap").update(final_vegan="yes")  # 출처 0개 → unknown 강등
    next(r for r in sheet if r["slug"] == "injera").update(final_vegan="yes", diet_sources="https://a.example")
    next(r for r in sheet if r["slug"] == "falafel").update(final_vegan="yes", diet_sources="https://a.example https://b.example")
    with open(tmp / "data/draft/review_sheet.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=sheet[0].keys()); w.writeheader(); w.writerows(sheet)
    rel_rows = list(csv.DictReader(open(tmp / "data/draft/relations_review.csv", encoding="utf-8-sig")))
    for r in rel_rows: r["approve"] = "Y" if r["type"] == "historical_link" else ""
    with open(tmp / "data/draft/relations_review.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=rel_rows[0].keys()); w.writeheader(); w.writerows(rel_rows)

    out = run(tmp, "s07_review.py", "import"); print(out)
    final = json.loads((tmp / "data/final/foods_final.json").read_text(encoding="utf-8"))
    assert "kimchi" not in final and "차단(모순)" in out
    assert final["bibimbap"]["diet"]["vegan"] == "unknown" and final["injera"]["diet"]["vegan"] == "unknown" and final["falafel"]["diet"]["vegan"] == "yes"
    assert final["injera"]["image_credit"].startswith("Someone / CC BY-SA 4.0")

    out = run(tmp, "s08_load.py", "--dry-run"); print(out); assert f"foods: {len(final)}행" in out and "lechon" not in final  # 돼지고기+halal≠no 도 차단
    out = run(tmp, "s08_load.py"); print(out); assert "food_relations" in out and "data_sources: 34행" in out
    sys.path.insert(0, str(tmp / "scripts"))
    from s08_load import build_payloads
    from common import read_csv as _rc
    p = build_payloads(_rc(tmp / "data/seed/countries.csv"), final)
    assert all(src["data_source_id"] for src in p["sources"])
    assert len({tuple(sorted(src)) for src in p["sources"]}) == 1          # PostgREST 일괄 upsert: 모든 행 키 동일
    assert {"wikipedia", "wikidata", "wikimedia_commons", "foodis_llm_draft", "foodis_review"} <= {x["data_source_id"] for x in p["sources"]}
    (tmp_path / "payload.json").write_text(json.dumps(p, ensure_ascii=False), encoding="utf-8")
    out = run(tmp, "s09_embed.py"); print(out); assert f"임베딩 {len(final)}건 완료" in out
    txt = json.loads((tmp / "data/final/embedding_texts.json").read_text(encoding="utf-8"))["injera"]
    assert "에티오피아 음식" in txt and "발효" in txt


@pytest.mark.parametrize("provider,draft_model,smart_model", [("openai", "gpt-6-luna", "gpt-6.1-sol"),
                                                               ("anthropic", "claude-haiku-4-5", "claude-sonnet-5")])
def test_s05_other_providers(tmp_path, provider, draft_model, smart_model):
    """DATA_LLM_PROVIDER 로 바꾸면 같은 스크립트가 OpenAI(Responses API · strict json_schema) / Anthropic(tool_use) 로 간다.
    두 번 다 스키마 위반이면 needs_review 로 저장되고, --needs-review --smart 로 다시 만들 수 있다."""
    tmp, rec = mini_kit(tmp_path), tmp_path / "rec.jsonl"
    env = {"DATA_LLM_PROVIDER": provider, "FOODIS_TEST_RECORD": str(rec)}
    out = run(tmp, "s05_llm_draft.py", "kimchi", "mandu", "injera", env_extra={**env, "FAKE_LLM_INVALID_ALWAYS": "Mandu"}); print(out)
    dr = drafts_of(tmp)
    assert set(dr) == {"kimchi", "mandu", "injera"}                      # slug 지정이면 --yes 없이 그것만
    assert dr["kimchi"]["provider"] == provider and dr["kimchi"]["model"] == draft_model and "needs_review" not in dr["kimchi"]
    assert dr["mandu"]["needs_review"] and dr["mandu"]["usage"]["attempts"] == 2 and "검수 필요" in out
    reqs = recorded(rec, "openai.com/v1/responses" if provider == "openai" else "anthropic.com")
    assert len(reqs) == 4                                                 # 3건 + 만두 재요청 1회
    body = reqs[0]["json"]
    if provider == "openai":
        assert body["store"] is False and body["instructions"] and "Authorization" in reqs[0]["headers"]
        assert "service_tier" not in body and "reasoning" not in body       # 기본: 표준 요금 · 모델 기본 생각량
    else:
        assert body["tool_choice"] == {"type": "tool", "name": "food_draft"} and "temperature" not in body
    retried = [r for r in reqs if "<schema_errors>" in json.dumps(r["json"], ensure_ascii=False)]
    assert len(retried) == 1 and "Mandu" in json.dumps(retried[0]["json"])  # 재요청에만 오류 안내가 붙는다
    run(tmp, "s05_llm_draft.py", env_extra=env, code=2)                   # 남은 1건(bibimbap)도 전체 실행이면 --yes 필요
    out = run(tmp, "s05_llm_draft.py", "--needs-review", "--smart", env_extra=env); print(out)
    dr = drafts_of(tmp)
    assert "needs_review" not in dr["mandu"] and dr["mandu"]["model"] == smart_model and dr["mandu"]["usage"]["tier"] == "smart"
    assert "bibimbap" not in dr
    if provider == "openai":   # 4xx(잘못된 키·모델 등)는 재시도 없이 멈추고, 에러 본문의 키 조각은 가린다
        out = run(tmp, "s05_llm_draft.py", "bibimbap", env_extra={**env, "DATA_LLM_MODEL": "gpt-bad-key", "DATA_LLM_PRICE": "0.1,0.5"}, code=1)
        assert "요청 거부 (401)" in out and "[키]" in out and "sk-proj" not in out and "이어서" in out
        assert "bibimbap" not in drafts_of(tmp)


def test_s05_needs_review_reaches_review_sheet(tmp_path):
    """Gemini 가 두 번 다 스키마를 어기면: s06 관계 후보에서 빠지고, s07 검수 시트에 경고, 승인해도 import 에서 차단."""
    tmp = mini_kit(tmp_path)
    out = run(tmp, "s05_llm_draft.py", "kimchi", "mandu", "injera", env_extra={"FAKE_LLM_INVALID_ALWAYS": "Mandu"}); print(out)
    assert any("taste_tags" in e for e in drafts_of(tmp)["mandu"]["needs_review"])
    run(tmp, "s06_relations.py")
    rels = json.loads((tmp / "data/draft/relations_draft.json").read_text(encoding="utf-8"))
    assert not any("mandu" in (r["from"], r["to"]) for r in rels)
    run(tmp, "s07_review.py", "export")
    sheet = list(csv.DictReader(open(tmp / "data/draft/review_sheet.csv", encoding="utf-8-sig")))
    assert "AI 초안 스키마 오류" in next(r for r in sheet if r["slug"] == "mandu")["auto_flags"]
    for r in sheet: r["approve"] = "Y"
    with open(tmp / "data/draft/review_sheet.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=sheet[0].keys()); w.writeheader(); w.writerows(sheet)
    out = run(tmp, "s07_review.py", "import"); print(out)
    final = json.loads((tmp / "data/final/foods_final.json").read_text(encoding="utf-8"))
    assert "mandu" not in final and "injera" in final and "차단(초안 오류): mandu" in out


def test_s05_flex_effort_and_dry_run(tmp_path):
    """--flex → Gemini serviceTier=flex · 비용 50%, DATA_LLM_EFFORT → thinkingLevel. --dry-run 은 키 없이도 된다."""
    tmp, rec = mini_kit(tmp_path), tmp_path / "rec.jsonl"
    std = run(tmp, "s05_llm_draft.py", "--dry-run", env_extra={"GEMINI_API_KEY": ""})
    flex = run(tmp, "s05_llm_draft.py", "--dry-run", "--flex", env_extra={"GEMINI_API_KEY": ""})
    usd = lambda s: float(s.split("≈ $")[1].split()[0].replace(",", ""))
    assert "대상 4건" in std and abs(usd(flex) - usd(std) / 2) < 1e-3 and "flex" in flex
    run(tmp, "s05_llm_draft.py", "kimchi", "--flex", env_extra={"FOODIS_TEST_RECORD": str(rec), "DATA_LLM_EFFORT": "low"})
    (req,) = recorded(rec, ":generateContent")
    assert req["json"]["serviceTier"] == "flex" and req["json"]["generationConfig"]["thinkingConfig"] == {"thinkingLevel": "LOW"}
    assert req["timeout"] >= 600 and req["headers"] == ["x-goog-api-key"] and "key=" not in req["url"]   # 키는 URL 이 아니라 헤더로
    assert drafts_of(tmp)["kimchi"]["usage"]["service_tier"] == "flex"
    out = run(tmp, "s05_llm_draft.py", "kimchi", env_extra={"GEMINI_API_KEY": ""}, code=1)
    assert "GEMINI_API_KEY" in out
    out = run(tmp, "s05_llm_draft.py", "--dry-run", env_extra={"DATA_LLM_MODEL": "gpt-6-luna"}, code=1)
    assert "gemini 모델이 아니에요" in out


def test_s09_gemini_embeddings(tmp_path):
    """DATA_EMBED_PROVIDER=gemini → batchEmbedContents(outputDimensionality 1536), 결과는 L2 정규화된 1536차원."""
    tmp, rec = copy_kit(tmp_path), tmp_path / "rec.jsonl"
    (tmp / "data/final").mkdir(parents=True, exist_ok=True)
    food = lambda slug, ko, cc: {"slug": slug, "name_ko": ko, "name_en": slug.title(), "country_code": cc, "summary": f"{ko} 요약이에요.",
                                 "taste_tags": ["sour", "fermented"], "cooking_method": "fermented", "course_type": "bread",
                                 "ingredients": [{"name_ko": "테프", "name_en": "Teff", "role": "main"}], "diet": {"vegan": "yes"}, "culture_story": None}
    (tmp / "data/final/foods_final.json").write_text(json.dumps({"injera": food("injera", "인제라", "ET"), "kimchi": food("kimchi", "김치", "KR")},
                                                                ensure_ascii=False), encoding="utf-8")
    env = {"DATA_EMBED_PROVIDER": "gemini", "FOODIS_TEST_RECORD": str(rec)}
    out = run(tmp, "s09_embed.py", env_extra=env); print(out)
    assert "임베딩 2건 완료" in out and "gemini-embedding-2" in out and "task: search result | query:" in out   # 앱과 맞추라는 경고
    (emb,) = recorded(rec, ":batchEmbedContents")
    assert emb["url"].endswith("/models/gemini-embedding-2:batchEmbedContents")
    assert all(r["outputDimensionality"] == 1536 and r["content"]["parts"][0]["text"].startswith("title: ") for r in emb["json"]["requests"])
    (up,) = recorded(rec, "/rest/v1/food_embeddings")
    for row in up["json"]:
        v = json.loads(row["embedding"])
        assert len(v) == 1536 and abs(math.sqrt(sum(x * x for x in v)) - 1) < 1e-9 and row["model"] == "gemini-embedding-2"
    # 앱이 EMBED_PROVIDER 만 정해 둔 경우도 따라간다 / 제공자·모델이 어긋나면 돈 쓰기 전에 멈춤
    assert "gemini-embedding-2" in run(tmp, "s09_embed.py", "--dry-run", env_extra={"EMBED_PROVIDER": "gemini"})
    out = run(tmp, "s09_embed.py", env_extra={"DATA_EMBED_PROVIDER": "gemini", "EMBEDDING_MODEL": "text-embedding-3-small"}, code=1)
    assert "gemini 임베딩 모델이 아니에요" in out


def test_llm_units(tmp_path):
    """스키마가 세 제공자 공통 부분집합인지, 검증·가격 계산이 맞는지 (네트워크 없음)."""
    tmp = copy_kit(tmp_path)
    sys.path.insert(0, str(tmp / "scripts"))
    import llm, s05_llm_draft as s05
    assert llm.portable_problems(s05.SCHEMA) == []
    assert llm.portable_problems({"type": "object", "properties": {"a": {"type": "string"}}, "oneOf": []}) == [
        "$: oneOf 사용 금지", "$: additionalProperties:false 필요", "$: required 에 빠진 속성 ['a']"]
    assert len(llm.validate({"summary": 1}, s05.SCHEMA)) == 8                            # 오류는 최대 8개까지만
    ok = {"summary": "요약이에요.", "history": None, "culture_story": None, "cooking_method": "raw", "taste_tags": ["fresh", "sour"],
          "course_type": "side", "name_local": None, "allergens": [], "used_evidence": ["wikipedia_en"],
          "ingredients": [{"name_en": "Fish", "name_ko": "생선", "role": "main", "category": "seafood", "animal_origin": True, "pork": False, "allergen": None}],
          "diet_draft": {"vegan": "no", "vegetarian": "no", "halal": "depends", "gluten_free": "yes", "dairy_free": "yes", "reason": "생선"}}
    assert llm.validate(ok, s05.SCHEMA) == []
    assert llm.validate({**ok, "summary": 1}, s05.SCHEMA) == ["summary: 1 is not of type 'string'"]
    assert llm.validate({**ok, "extra": 1}, s05.SCHEMA)                                   # additionalProperties:false
    assert llm.validate({**ok, "ingredients": [{**ok["ingredients"][0], "allergen": "fish"}]}, s05.SCHEMA) == []
    assert llm.price("gemini-3.8-flash", date(2026, 12, 31)) == (0.75, 3.75)
    assert llm.price("gemini-3.8-flash", date(2027, 1, 1)) == (1.50, 7.50)               # 예고된 인상
    assert llm.cost_usd(1_000_000, 1_000_000, "gpt-6-luna") == pytest.approx(0.60)
    assert llm.cost_usd(1_000_000, 1_000_000, "gpt-6-luna", "flex") == pytest.approx(0.30)
    assert llm.cost_usd(1, 1, "unknown-model") is None
    assert llm.estimate_tokens("abcdefg") == 3 and llm.estimate_tokens("김치") == 2
