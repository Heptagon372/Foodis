"""전체 파이프라인 오프라인 E2E 테스트: 임시 폴더에 키트를 복사하고 가짜 HTTP로 s01~s09 를 실제 실행한다."""
import csv, json, os, shutil, subprocess, sys
from pathlib import Path

KIT = Path(__file__).resolve().parents[1]

def run(tmp, *args, env_extra=None):
    env = {**os.environ, "PYTHONPATH": str(KIT / "tests" / "fakehttp"), "ANTHROPIC_API_KEY": "x", "OPENAI_API_KEY": "x",
           "FOODIS_HTTP_INTERVAL": "0", "SUPABASE_URL": "https://fake.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "x",
           "FOODIS_TEST_FINAL": str(tmp / "data/final/foods_final.json"), **(env_extra or {})}
    r = subprocess.run([sys.executable, *args], cwd=tmp / "scripts", env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
    assert r.returncode == 0, r.stdout + r.stderr
    return r.stdout

def make_xlsx(path):
    from openpyxl import Workbook
    wb = Workbook(); ws = wb.active
    ws.append(["번호", "한글 메뉴명", "영문 표기", "국문 설명", "영문 설명"])
    ws.append([1, "김치", "Kimchi", "배추 발효 음식", "Fermented cabbage"])
    ws.append([2, "비빔밥", "Bibimbap", "비벼 먹는 밥", "Mixed rice"])
    wb.save(path)

def test_full_pipeline(tmp_path):
    tmp = tmp_path / "kit"
    shutil.copytree(KIT, tmp, ignore=shutil.ignore_patterns("tests", "__pycache__", "*.json", ".env"))
    (tmp / "data/raw").mkdir(parents=True, exist_ok=True); make_xlsx(tmp / "data/raw/hansik800.xlsx")

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

    out = run(tmp, "s05_llm_draft.py"); assert f"초안 {n}건" in out
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
