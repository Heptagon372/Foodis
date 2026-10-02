"""②-b 사진 보강: s02 가 못 찾았거나 맞지 않아 보이는 대표 이미지를 다른 출처에서 찾는다.

입력: data/raw/wikipedia.json (s02 결과), data/raw/wikidata.json, data/seed/dish_targets.csv, data/seed/image_overrides.csv
출력: data/raw/wikipedia.json 의 image 를 갱신 (+ image.fit 점수), data/raw/image_report.json

순서 (음식마다, 앞에서 찾으면 멈춤):
  0) 사람이 고른 교체 지정(override) · "사진 없음(-)" 은 건드리지 않는다
  1) s02 이미지는 유지 — P18 은 Wikidata 편집자가 그 음식에 붙인 사진, 문서 대표 이미지는 그 음식 문서의 첫 사진이라 신뢰.
     단 지도·국기·로고·도표(SVG·GIF 등)는 버린다
  2) 위키미디어 공용 검색 (commons_search) — 음식 이름(영어·현지어·한국어)으로 파일을 찾고,
     ① 파일 이름이 음식 이름과 맞고 ② 파일의 공용 분류(category)에 음식 관련 말이 있는 사진만
     (같은 이름의 사람·배·곤충·지명 사진을 거른다)
  3) Openverse (openverse) — Flickr 등 CC 사진 모음. 상업적 이용 가능 라이선스(CC0 · PDM · CC BY · CC BY-SA)만,
     제목이 음식 이름과 맞고 제목·태그에 음식 관련 말이 있는 사진만.
     키 없이 하루 200회 → OPENVERSE_CLIENT_ID/SECRET 이 있으면 토큰으로 (하루 1만 회)
어느 출처든 라이선스 허용 목록은 s02 와 같다 (데이터 소스 레지스트리: wikimedia_commons · openverse).

  python scripts/s02b_images.py                 # 사진 없음 + 맞지 않아 보이는 것만
  python scripts/s02b_images.py --recheck-all   # 유지 판정도 다시 (점수만 갱신)
  python scripts/s02b_images.py kimchi injera   # 특정 음식만
"""
from __future__ import annotations

import argparse
import os
import re
import unicodedata

from common import RAW, SEED, Http, chunks, read_csv, read_json, write_json
from s02_wikipedia import COMMONS_API, NO_IMAGE, file_key, image_credits, is_free_license, load_overrides

OPENVERSE = "https://api.openverse.org/v1"
# 공용 파일 이름·설명에 이런 말이 있으면 음식 사진이 아니다
JUNK = re.compile(r"\b(map|locator|location|flag|coat of arms|emblem|logo|seal|diagram|chart|stamp|banknote|coin|"
                  r"icon|portrait|statue|signage|menu board|recipe card|packag|wrapper|label)\b|\.(svg|gif|tiff?|pdf|djvu|webm|ogv)$",
                  re.I)
STOP = {"the", "and", "with", "of", "de", "la", "le", "el", "al", "a", "in", "dish", "food", "cuisine", "style"}
# 공용 분류 · Openverse 태그에 이런 말이 있어야 음식 사진으로 본다
FOOD_WORDS = re.compile(r"\b(foods?|cuisines?|dish(es)?|meals?|soups?|stews?|breads?|cakes?|desserts?|pastr(y|ies)|cookies?|biscuits?|"
                        r"sweets|confectioner(y|ies)|cand(y|ies)|cheeses?|sausages?|meat|seafood|noodles?|rice dishes|salads?|sauces?|"
                        r"snacks?|drinks?|beverages?|tea|coffee|juices?|baked goods|fried|grilled|barbecue|kebabs?|dumplings?|pies?|"
                        r"curr(y|ies)|porridges?|pancakes?|breakfast|lunch|dinner|street food|bakery|bakeries|recipes?|gastronomy|"
                        r"eaten|plates? of food|food photography)\b", re.I)
# 이런 분류가 붙은 파일은 음식 사진이 아니다 (같은 이름의 사람·학교·군 기지·배 …)
NOT_FOOD = re.compile(r"\b(births|deaths|people|politicians|players|portraits?|ships?|military|bases?|schools?|students|"
                      r"trails?|tracks?|maps?|logos?|buildings?|streets?|mollus[ck]s?|insects?|species)\b", re.I)
MIN_FIT = 0.6        # 이름 토큰 중 이 비율 이상이 제목·태그에 있어야 맞는 사진으로 본다
MIN_SIDE = 400       # 너무 작은 사진은 카드에서 깨진다


def fold(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def tokens(s: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", fold(s)) if len(t) >= 3 and t not in STOP]


def fit(names: list[str], text: str) -> float:
    """음식 이름 후보들 중 가장 잘 맞는 것의 점수 (0~1). 이름 전체가 붙어서 나오면 1.0"""
    hay = fold(text)
    hay_tokens = set(re.findall(r"[a-z0-9]+", hay))
    joined = re.sub(r"[^a-z0-9]", "", hay)
    best = 0.0
    for n in names:
        toks = tokens(n)
        if not toks:
            continue
        if "".join(toks) and "".join(toks) in joined:
            return 1.0
        best = max(best, sum(1 for t in toks if t in hay_tokens) / len(toks))
    # 한국어 이름은 그대로 비교 (공용 파일 이름에 한글이 들어간 경우)
    for n in names:
        if re.search(r"[가-힣]", n) and n.replace(" ", "") in text.replace(" ", ""):
            return 1.0
    return best


def names_of(target: dict, wd: dict) -> list[str]:
    strip = lambda s: re.sub(r"\s*\([^)]*\)$", "", s or "").strip()  # noqa: E731
    out = [target["name_en"], strip(wd.get("src_title")), strip(wd.get("en_title")), wd.get("label_en"),
           strip(target.get("name_ko")), strip(wd.get("ko_title"))]
    seen, uniq = set(), []
    for n in out:
        if n and n.lower() not in seen:
            seen.add(n.lower())
            uniq.append(n)
    return uniq


def judge(img: dict | None, names: list[str]) -> tuple[bool, float, str]:
    """(유지할지, 점수, 이유)"""
    if not img:
        return False, 0.0, "사진 없음"
    text = f"{img.get('file', '')} {img.get('title', '')}"
    if JUNK.search(img.get("file") or "") or JUNK.search(img.get("title") or ""):
        return False, 0.0, f"음식 사진이 아닌 것 같음 ({img.get('file')})"
    score = fit(names, text)
    if img.get("source") in ("override", "p18", "pageimage"):
        return True, max(score, 0.8), "사람·Wikidata·음식 문서 지정"
    if score >= MIN_FIT:
        return True, score, "이름 일치"
    return False, score, f"파일 이름이 음식 이름과 다름 ({img.get('file')})"


def commons_search(http: Http, names: list[str]) -> list[str]:
    """공용 파일 검색: 이름마다 상위 15개 파일명"""
    files: list[str] = []
    for n in names[:3]:
        r = http.get(COMMONS_API, params={"action": "query", "format": "json", "formatversion": 2, "list": "search",
                                          "srsearch": f'"{n}" filetype:bitmap', "srnamespace": 6, "srlimit": 15})
        for h in r.get("query", {}).get("search", []):
            f = file_key(h["title"])
            if f not in files:
                files.append(f)
    return files


def food_categories(http: Http, files: list[str]) -> dict[str, list[str]]:
    """공용 파일 → 숨기지 않은 분류 이름들"""
    out: dict[str, list[str]] = {}
    for batch in chunks(files, 20):
        r = http.get(COMMONS_API, params={"action": "query", "format": "json", "formatversion": 2, "prop": "categories",
                                          "clshow": "!hidden", "cllimit": "max", "titles": "|".join(f"File:{f}" for f in batch)})
        for p in r.get("query", {}).get("pages", []):
            out[file_key(p["title"])] = [c["title"].removeprefix("Category:") for c in p.get("categories", [])]
    return out


def pick_commons(http: Http, names: list[str]) -> dict | None:
    files = [f for f in commons_search(http, names) if not JUNK.search(f)]
    scored = sorted(((fit(names, f), f) for f in files), key=lambda x: -x[0])
    good = [f for s, f in scored if s >= MIN_FIT][:10]
    if not good:
        return None
    cats = food_categories(http, good)
    good = [f for f in good if any(FOOD_WORDS.search(c) for c in cats.get(file_key(f), []))
            and not any(NOT_FOOD.search(c) for c in cats.get(file_key(f), []))]
    if not good:
        return None
    creds = image_credits(http, good)
    for f in good:
        c = creds.get(file_key(f))
        if c and is_free_license(c["license"]):
            return {**c, "source": "commons_search", "fit": round(fit(names, f), 2)}
    return None


class Openverse:
    """키 없이 하루 200회 · 분당 20회. 토큰이 있으면 하루 1만 회."""

    def __init__(self, http: Http):
        self.http, self.headers, self.left = http, {}, int(os.environ.get("OPENVERSE_DAILY_BUDGET", 190))
        cid, secret = os.environ.get("OPENVERSE_CLIENT_ID"), os.environ.get("OPENVERSE_CLIENT_SECRET")
        if cid and secret:
            tok = http.post(f"{OPENVERSE}/auth_tokens/token/", data={"grant_type": "client_credentials", "client_id": cid,
                                                                      "client_secret": secret}, cache=False)
            self.headers = {"Authorization": f"Bearer {tok['access_token']}"}
            self.left = int(os.environ.get("OPENVERSE_DAILY_BUDGET", 9000))

    def search(self, query: str) -> list[dict]:
        if self.left <= 0:
            return []
        params = {"q": query, "license_type": "commercial", "category": "photograph", "page_size": 20,
                  "mature": "false"}
        key_cached = self.http.cache_dir and self.http._key("GET", f"{OPENVERSE}/images/", params, None).exists()
        if not key_cached:
            self.left -= 1
        try:
            r = self.http.get(f"{OPENVERSE}/images/", params=params, headers=self.headers)
        except Exception as e:  # 한도 초과(429 반복) 등
            print(f"  ⚠ Openverse '{query}' 실패 ({e})")
            self.left = 0
            return []
        return (r or {}).get("results", [])


OV_LICENSE = {"cc0": "CC0", "pdm": "Public domain", "by": "CC BY", "by-sa": "CC BY-SA"}


def pick_openverse(ov: Openverse, names: list[str]) -> dict | None:
    for n in names[:2]:
        best = None
        for r in ov.search(n):
            if r.get("source") == "wikimedia" or r.get("license") not in OV_LICENSE:
                continue  # 공용은 2) 에서 이미 봤다
            if min(r.get("width") or 0, r.get("height") or 0) < MIN_SIDE:
                continue
            text = f"{r.get('title') or ''} " + " ".join(t["name"] for t in (r.get("tags") or []) if t.get("name"))
            if JUNK.search(r.get("title") or "") or not FOOD_WORDS.search(text):
                continue
            # 제목이 음식 이름과 맞아야 한다 (태그만 맞는 사진은 상관없는 장면이 많다)
            title_fit = fit(names, r.get("title") or "")
            s = 0.7 * title_fit + 0.3 * fit(names, text)
            if title_fit >= MIN_FIT and (not best or s > best[0]):
                best = (s, r)
        if best:
            s, r = best
            lic = f"{OV_LICENSE[r['license']]} {r.get('license_version') or ''}".strip() if r["license"] not in ("cc0", "pdm") else OV_LICENSE[r["license"]]
            return {"url": r["url"], "page": r.get("foreign_landing_url"), "artist": r.get("creator"), "license": lic,
                    "file": r.get("title"), "title": r.get("title"), "provider": r.get("source"),
                    "source": "openverse", "fit": round(s, 2)}
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("slugs", nargs="*")
    ap.add_argument("--recheck-all", action="store_true", help="유지 판정을 받은 사진도 점수를 다시 매긴다")
    ap.add_argument("--no-openverse", action="store_true")
    args = ap.parse_args()

    http = Http(min_interval=0.4)
    wp = read_json(RAW / "wikipedia.json", {})
    wd = read_json(RAW / "wikidata.json", {})
    if not wp:
        raise SystemExit("먼저 s02_wikipedia.py 를 실행하세요")
    targets = {t["slug"]: t for t in read_csv(SEED / "dish_targets.csv")}
    overrides = load_overrides()
    ov = None if args.no_openverse else Openverse(http)

    report: dict[str, dict] = {}
    counts: dict[str, int] = {}
    slugs = args.slugs or [s for s in wp if s in targets]
    for i, slug in enumerate(slugs, 1):
        if overrides.get(slug):  # 사람이 정한 건 그대로 (사진 없음 '-' 포함)
            counts["override"] = counts.get("override", 0) + 1
            continue
        names = names_of(targets[slug], wd.get(slug, {}))
        cur = wp[slug].get("image")
        keep, score, why = judge(cur, names)
        if keep:
            cur["fit"] = round(score, 2)
            counts["유지"] = counts.get("유지", 0) + 1
            continue
        new = pick_commons(http, names)
        if not new and ov:
            new = pick_openverse(ov, names)
        if new:
            wp[slug]["image"] = new
            counts[new["source"]] = counts.get(new["source"], 0) + 1
        else:
            # 맞지 않아 보여도 다른 후보가 없으면 지도·로고가 아닌 한 원래 사진을 둔다 (국가색 카드보다 낫다)
            if cur and not why.startswith("음식 사진이 아닌"):
                cur["fit"] = round(score, 2)
                counts["후보 없음 · 원래 사진 유지"] = counts.get("후보 없음 · 원래 사진 유지", 0) + 1
            else:
                wp[slug]["image"] = None
                counts["사진 없음"] = counts.get("사진 없음", 0) + 1
        report[slug] = {"was": (cur or {}).get("file"), "why": why, "now": (wp[slug]["image"] or {}).get("file"),
                        "source": (wp[slug]["image"] or {}).get("source"), "fit": (wp[slug]["image"] or {}).get("fit")}
        if i % 100 == 0:
            print(f"  · {i}/{len(slugs)}")
            write_json(RAW / "wikipedia.json", wp)  # 중간 저장 (끊겨도 이어서)

    write_json(RAW / "wikipedia.json", wp)
    write_json(RAW / "image_report.json", report)
    with_img = sum(1 for s in slugs if wp[s].get("image"))
    print(f"✔ 사진 {with_img}/{len(slugs)}건 · " + " · ".join(f"{k} {n}" for k, n in counts.items()))
    if ov and ov.left <= 0:
        print("ℹ Openverse 오늘 한도를 다 썼어요. 내일 다시 실행하면 이어서 찾습니다 (OPENVERSE_CLIENT_ID/SECRET 이 있으면 하루 1만 회).")
    print("  변경 내역: data/raw/image_report.json")


if __name__ == "__main__":
    main()
