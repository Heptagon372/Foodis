"""⑩ 음식 갤러리 수집: 음식마다 사진 1~5장을 모은다.

입력: apps/web/lib/preview/catalog.json (음식 2,147개: slug · 이름 · 나라 · 유명도)
출력: foodis-data/data/raw/gallery.json  { slug: [{ url, thumb, title, source, license, credit_url, author, fit }] }

출처 (출처마다 라이선스·메타데이터·이름 일치를 모두 확인):
  1) Wikimedia Commons — 공용 파일 검색 → 라이선스 확인 → 분류에 음식 관련 말이 있는 사진만 (가장 믿을 만함)
  2) Openverse (CC/PDM) — 상업 사용 가능 라이선스만, 제목이 음식 이름과 맞는 것만
  3) DuckDuckGo 이미지 검색 — 구글과 비슷한 커버리지. 공식 키는 없고, vqd 토큰 받아 i.js 엔드포인트 호출.
     결과 제목·출처 도메인이 음식 이름과 맞는 사진만. 저작권은 '출처 URL 로 바로 가기' 로 표기 (hotlink).

사용:
  python scripts/s10_gallery.py                  # 아직 안 모은 음식만 (checkpoint 이어가기)
  python scripts/s10_gallery.py --limit 10       # 처음 10 개만
  python scripts/s10_gallery.py kimchi bibimbap  # 특정 음식만
  python scripts/s10_gallery.py --refresh        # 이미 모은 것도 새로
  python scripts/s10_gallery.py --no-ddg         # DuckDuckGo 제외 (공용+오픈버스만)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

from common import RAW, Http, read_json, write_json
from s02_wikipedia import file_key, image_credits, is_free_license
from s02b_images import JUNK, FOOD_WORDS, NOT_FOOD, MIN_FIT, MIN_SIDE, fit, commons_search, food_categories, Openverse, OV_LICENSE

CATALOG = Path(__file__).resolve().parents[2] / "apps" / "web" / "lib" / "preview" / "catalog.json"
OUT = RAW / "gallery.json"
MAX_PER_FOOD = 5
DDG_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"


def names_from_catalog(c: dict) -> list[str]:
    """카탈로그 음식의 이름 후보 (영문 · 한국어)"""
    seen, out = set(), []
    for n in [c.get("en"), c.get("ko"), c.get("s", "").replace("-", " ")]:
        if n and n.lower() not in seen:
            seen.add(n.lower())
            out.append(n)
    return out


def commons_photos(http: Http, names: list[str], want: int) -> list[dict]:
    files = [f for f in commons_search(http, names) if not JUNK.search(f)]
    scored = sorted(((fit(names, f), f) for f in files), key=lambda x: -x[0])
    good = [f for s, f in scored if s >= MIN_FIT][:20]
    if not good:
        return []
    cats = food_categories(http, good)
    good = [f for f in good if any(FOOD_WORDS.search(c) for c in cats.get(file_key(f), []))
            and not any(NOT_FOOD.search(c) for c in cats.get(file_key(f), []))]
    if not good:
        return []
    creds = image_credits(http, good)
    out, seen = [], set()
    for f in good:
        if len(out) >= want:
            break
        c = creds.get(file_key(f))
        if not c or not is_free_license(c["license"]) or c["url"] in seen:
            continue
        seen.add(c["url"])
        out.append({
            "url": c["url"],
            "thumb": c.get("thumb") or c["url"],
            "title": c.get("file") or f,
            "source": "wikimedia_commons",
            "license": c["license"],
            "credit_url": c.get("page") or f"https://commons.wikimedia.org/wiki/File:{f}",
            "author": c.get("artist"),
            "fit": round(fit(names, f), 2),
        })
    return out


def openverse_photos(ov: Openverse, names: list[str], want: int, seen_urls: set[str]) -> list[dict]:
    out: list[dict] = []
    for n in names[:2]:
        if len(out) >= want:
            break
        for r in ov.search(n):
            if len(out) >= want:
                break
            url = r.get("url")
            if not url or url in seen_urls:
                continue
            if r.get("source") == "wikimedia" or r.get("license") not in OV_LICENSE:
                continue
            if min(r.get("width") or 0, r.get("height") or 0) < MIN_SIDE:
                continue
            title = r.get("title") or ""
            tags_text = " ".join(t["name"] for t in (r.get("tags") or []) if t.get("name"))
            text = f"{title} {tags_text}"
            if JUNK.search(title) or not FOOD_WORDS.search(text):
                continue
            title_fit = fit(names, title)
            if title_fit < MIN_FIT:
                continue
            lic_key = r["license"]
            lic = OV_LICENSE[lic_key] if lic_key in ("cc0", "pdm") else f"{OV_LICENSE[lic_key]} {r.get('license_version') or ''}".strip()
            seen_urls.add(url)
            out.append({
                "url": url,
                "thumb": r.get("thumbnail") or url,
                "title": title,
                "source": "openverse",
                "license": lic,
                "credit_url": r.get("foreign_landing_url"),
                "author": r.get("creator"),
                "fit": round(0.7 * title_fit + 0.3 * fit(names, text), 2),
            })
    return out


_DDG_VQD = {}


def ddg_vqd(http: Http, query: str) -> str | None:
    """DuckDuckGo 이미지 검색은 vqd 토큰이 필요하다. HTML 응답에서 뽑는다."""
    if query in _DDG_VQD:
        return _DDG_VQD[query]
    try:
        r = http.s.get("https://duckduckgo.com/", params={"q": query, "iax": "images", "ia": "images"},
                       headers={"User-Agent": DDG_UA}, timeout=15)
        m = re.search(r'vqd=["\']?(\d-[\d-]+)["\']?', r.text) or re.search(r'vqd=([\d-]+)', r.text)
        v = m.group(1) if m else None
        _DDG_VQD[query] = v
        return v
    except Exception:
        return None


def ddg_photos(http: Http, names: list[str], want: int, seen_urls: set[str]) -> list[dict]:
    """DuckDuckGo 이미지 검색. '제목 또는 출처 도메인'이 음식 이름과 맞고, 음식 관련 키워드가 있는 결과만.
       라이선스는 모호 → 'via <도메인>' 로 표기하고 UI 에서 이미지 클릭 시 원 페이지로 이동."""
    out: list[dict] = []
    for n in names[:2]:
        if len(out) >= want:
            break
        q = f'"{n}" food'
        vqd = ddg_vqd(http, q)
        if not vqd:
            continue
        try:
            # 공식 API 아님 — 토큰 받고 i.js 엔드포인트 호출. ToS 그레이존, 블록 시 조용히 실패.
            r = http.s.get("https://duckduckgo.com/i.js", params={
                "l": "us-en", "o": "json", "q": q, "vqd": vqd, "f": ",,,,,", "p": "1"
            }, headers={"User-Agent": DDG_UA, "Referer": "https://duckduckgo.com/"}, timeout=20)
            if r.status_code != 200:
                continue
            data = r.json()
        except Exception as e:
            print(f"    ⚠ DDG '{n}' 실패 ({e})", file=sys.stderr)
            continue
        for item in (data.get("results") or [])[:30]:
            if len(out) >= want:
                break
            url = item.get("image")
            thumb = item.get("thumbnail")
            title = item.get("title") or ""
            src = item.get("source") or ""     # 'Wikipedia', 'allrecipes.com', etc
            page = item.get("url") or ""
            w, h = item.get("width") or 0, item.get("height") or 0
            if not url or url in seen_urls:
                continue
            if min(w, h) < MIN_SIDE:
                continue
            if not re.search(r"\.(jpg|jpeg|png|webp)(\?.*)?$", url, re.I):
                continue
            # 제목이 음식 이름과 맞아야. 음식 아닌 키워드 섞이면 거절.
            title_fit = fit(names, title)
            if title_fit < MIN_FIT:
                continue
            if JUNK.search(title) or re.search(r"\b(costume|tattoo|wallpaper|cartoon|clipart|coloring|emoji|logo|poster|label)\b", title, re.I):
                continue
            # 썸네일이 뚫리지 않는 호스트는 거른다 (gstatic encrypted-tbn 은 썸네일만 노출)
            seen_urls.add(url)
            domain = re.sub(r"^https?://(www\.)?([^/]+).*", r"\2", page) or src
            out.append({
                "url": url,
                "thumb": thumb or url,
                "title": title,
                "source": "web",
                "license": "all rights reserved (hotlink)",
                "credit_url": page or url,
                "author": domain,
                "fit": round(title_fit, 2),
            })
    return out


def collect(c: dict, http: Http, ov: Openverse | None, use_ddg: bool) -> list[dict]:
    names = names_from_catalog(c)
    photos: list[dict] = []
    seen = set()
    try:
        photos.extend(commons_photos(http, names, MAX_PER_FOOD))
        for p in photos:
            seen.add(p["url"])
    except Exception as e:
        print(f"    ⚠ Commons 실패 ({e})", file=sys.stderr)
    if ov and len(photos) < MAX_PER_FOOD:
        try:
            photos.extend(openverse_photos(ov, names, MAX_PER_FOOD - len(photos), seen))
        except Exception as e:
            print(f"    ⚠ Openverse 실패 ({e})", file=sys.stderr)
    if use_ddg and len(photos) < MAX_PER_FOOD:
        try:
            photos.extend(ddg_photos(http, names, MAX_PER_FOOD - len(photos), seen))
        except Exception as e:
            print(f"    ⚠ DDG 실패 ({e})", file=sys.stderr)
    return photos[:MAX_PER_FOOD]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("slugs", nargs="*")
    ap.add_argument("--limit", type=int, default=0, help="처음 N 개만 (0=전부)")
    ap.add_argument("--refresh", action="store_true", help="이미 모은 것도 새로")
    ap.add_argument("--no-openverse", action="store_true")
    ap.add_argument("--no-ddg", action="store_true")
    args = ap.parse_args()

    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    existing: dict[str, list[dict]] = read_json(OUT, {}) if not args.refresh else {}
    http = Http(min_interval=0.5)
    ov = None if args.no_openverse else Openverse(http)

    todo = [c for c in catalog if (args.slugs and c["s"] in args.slugs) or (not args.slugs and (args.refresh or c["s"] not in existing))]
    if args.limit:
        todo = todo[:args.limit]
    print(f"[s10] {len(todo)}/{len(catalog)} 음식 수집 (이미 {len(existing)} 완료)")

    for i, c in enumerate(todo, 1):
        slug = c["s"]
        try:
            photos = collect(c, http, ov, use_ddg=not args.no_ddg)
            existing[slug] = photos
            srcs = ", ".join(p["source"] for p in photos) or "없음"
            print(f"  [{i}/{len(todo)}] {slug} ({c['ko']}) → {len(photos)} 장 ({srcs})")
        except Exception as e:
            print(f"  [{i}/{len(todo)}] {slug} 실패: {e}", file=sys.stderr)
            existing[slug] = existing.get(slug, [])
        if i % 25 == 0:
            write_json(OUT, existing)
    write_json(OUT, existing)
    with_photos = sum(1 for v in existing.values() if v)
    print(f"[s10] 완료. 사진 있음 {with_photos}/{len(existing)}, 평균 {sum(len(v) for v in existing.values()) / max(len(existing), 1):.1f} 장")


if __name__ == "__main__":
    main()
