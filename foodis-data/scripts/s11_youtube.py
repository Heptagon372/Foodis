"""⑪ 유튜브 영상 수집: 음식마다 대표 영상 1개를 고른다 (유튭 아이콘 클릭 시 열림).

입력: apps/web/lib/preview/catalog.json
출력: foodis-data/data/raw/youtube.json  { slug: { video_id, url, title, channel, duration_sec, view_count } | null }

YouTube Data API 키가 없어 (환경에 없음) 검색 결과 페이지 HTML 에서 ytInitialData JSON 을 파싱한다.
'진실성' 가드:
  · 제목에 음식 이름(영 / 현지 / 한국어) 토큰이 MIN_FIT 이상 들어가야 한다 (동명이인 · 다른 주제 거절)
  · 제목이 음식 아닌 키워드(게임 · 캐릭터 · 노래)면 거절
  · 조회수 ≥ 5,000 · 길이 ≥ 30초 (저품질 · 쇼츠 테스트 영상 거절)
  · 제목에 '먹방 · 리뷰 · 레시피 · 쿠킹 · how to make · recipe · 요리' 같은 음식 관련 말이 하나는 들어가야

사용:
  python scripts/s11_youtube.py                  # 아직 안 찾은 음식만
  python scripts/s11_youtube.py --limit 10
  python scripts/s11_youtube.py kimchi
  python scripts/s11_youtube.py --refresh
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from common import RAW, Http, read_json, write_json
from s02b_images import fit, MIN_FIT

CATALOG = Path(__file__).resolve().parents[2] / "apps" / "web" / "lib" / "preview" / "catalog.json"
OUT = RAW / "youtube.json"
YT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
MIN_VIEWS = 5000
MIN_DURATION = 30
FOOD_HINTS = re.compile(
    r"\b(recipe|recipes|cooking|cook|make|homemade|how to|street food|restaurant|eating|mukbang|review|tutorial|"
    r"dish|cuisine|taste|tasting|food|chef|kitchen)\b|"
    r"(먹방|레시피|만들기|요리|쿠킹|리뷰|맛집|시식|맛|음식|조리|홈쿠킹)",
    re.I,
)
BAD_HINTS = re.compile(
    r"\b(song|lyrics|game|gameplay|minecraft|roblox|cartoon|anime|animation|trailer|movie|film|boxing|fight|wwe|"
    r"nba|nfl|basketball|football|match|highlights|concert|dance|tiktok|meme|prank|conspiracy|asmr sleep|"
    r"versus|v\.s\.)\b|\bvs\b|\bvs\.|VS!|챌린지\s*(?!먹방|요리|레시피|쿠킹)",
    re.I,
)


def names(c: dict) -> list[str]:
    seen, out = set(), []
    for n in [c.get("en"), c.get("ko"), c.get("s", "").replace("-", " ")]:
        if n and n.lower() not in seen:
            seen.add(n.lower())
            out.append(n)
    return out


def parse_duration(text: str) -> int:
    """'3:42' → 222 초, '1:03:15' → 3795 초"""
    if not text:
        return 0
    parts = text.split(":")
    try:
        parts = [int(p) for p in parts]
    except ValueError:
        return 0
    s = 0
    for p in parts:
        s = s * 60 + p
    return s


def parse_views(text: str) -> int:
    """'조회수 1.3만회' / '1,234,567 views' / '2.1M views' → 정수"""
    if not text:
        return 0
    t = text.replace(",", "").lower()
    m = re.search(r"([\d.]+)\s*([km만천억]?)", t)
    if not m:
        return 0
    try:
        n = float(m.group(1))
    except ValueError:
        return 0
    unit = m.group(2)
    mult = {"": 1, "k": 1000, "m": 1_000_000, "천": 1000, "만": 10000, "억": 100_000_000}.get(unit, 1)
    return int(n * mult)


def search(http: Http, query: str) -> list[dict]:
    """YouTube 검색 결과 HTML 에서 ytInitialData 를 꺼내 videoRenderer 들을 뽑는다."""
    try:
        r = http.s.get("https://www.youtube.com/results",
                       params={"search_query": query, "sp": "EgIQAQ%253D%253D"},  # sp 는 '동영상' 필터
                       headers={"User-Agent": YT_UA, "Accept-Language": "ko,en-US;q=0.9,en;q=0.8"},
                       timeout=20)
    except Exception as e:
        print(f"    ⚠ YouTube '{query}' 네트워크 실패 ({e})", file=sys.stderr)
        return []
    m = re.search(r"var ytInitialData\s*=\s*(\{.+?\});</script>", r.text, re.S)
    if not m:
        return []
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError:
        return []
    out: list[dict] = []
    sections = (((((data.get("contents") or {}).get("twoColumnSearchResultsRenderer") or {}).get("primaryContents") or {})
                .get("sectionListRenderer") or {}).get("contents") or [])
    for sec in sections:
        for item in (((sec.get("itemSectionRenderer") or {}).get("contents")) or []):
            v = item.get("videoRenderer")
            if not v:
                continue
            vid = v.get("videoId")
            if not vid:
                continue
            title = "".join(r.get("text", "") for r in ((v.get("title") or {}).get("runs") or []))
            channel = (((v.get("ownerText") or {}).get("runs") or [{}])[0]).get("text", "")
            length = ((v.get("lengthText") or {}).get("simpleText")) or ""
            views = ((v.get("viewCountText") or {}).get("simpleText")) or ((v.get("shortViewCountText") or {}).get("simpleText")) or ""
            out.append({
                "video_id": vid,
                "title": title,
                "channel": channel,
                "duration_sec": parse_duration(length),
                "view_count": parse_views(views),
                "url": f"https://www.youtube.com/watch?v={vid}",
            })
    return out


def pick(c: dict, http: Http) -> dict | None:
    name_list = names(c)
    # 한국어 음식은 한국어 검색부터, 아니면 영어부터
    queries = []
    if c.get("ko"):
        queries.append(f"{c['ko']} 음식")
    if c.get("en"):
        queries.append(f"{c['en']} food")
    best: tuple[float, dict] | None = None
    for q in queries:
        for v in search(http, q)[:15]:
            title = v["title"]
            if BAD_HINTS.search(title) or not FOOD_HINTS.search(title):
                continue
            if v["duration_sec"] < MIN_DURATION:
                continue
            if v["view_count"] < MIN_VIEWS:
                continue
            tf = fit(name_list, title)
            if tf < MIN_FIT:
                continue
            # 점수: 이름 일치(70%) + 조회수 로그(30%)
            import math
            score = 0.7 * tf + 0.3 * min(math.log10(v["view_count"] + 1) / 7.0, 1.0)
            if not best or score > best[0]:
                best = (score, {**v, "fit": round(tf, 2)})
        if best and best[0] >= 0.7:
            break  # 좋은 결과 찾으면 다음 쿼리 건너뛰기
    return best[1] if best else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("slugs", nargs="*")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    existing: dict[str, dict | None] = read_json(OUT, {}) if not args.refresh else {}
    http = Http(min_interval=1.0, cache_dir=RAW / "_youtube_cache")

    todo = [c for c in catalog if (args.slugs and c["s"] in args.slugs) or (not args.slugs and (args.refresh or c["s"] not in existing))]
    if args.limit:
        todo = todo[:args.limit]
    print(f"[s11] {len(todo)}/{len(catalog)} 음식 유튜브 검색 (이미 {len(existing)} 완료)")

    for i, c in enumerate(todo, 1):
        slug = c["s"]
        try:
            v = pick(c, http)
            existing[slug] = v
            if v:
                print(f"  [{i}/{len(todo)}] {slug} ({c['ko']}) → {v['title'][:50]} [{v['view_count']:,}회]")
            else:
                print(f"  [{i}/{len(todo)}] {slug} ({c['ko']}) → 없음")
        except Exception as e:
            print(f"  [{i}/{len(todo)}] {slug} 실패: {e}", file=sys.stderr)
            existing[slug] = existing.get(slug)
        if i % 25 == 0:
            write_json(OUT, existing)
    write_json(OUT, existing)
    with_video = sum(1 for v in existing.values() if v)
    print(f"[s11] 완료. 영상 있음 {with_video}/{len(existing)}")


if __name__ == "__main__":
    main()
