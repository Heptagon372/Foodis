"""② 위키백과 요약(ko/en) + 위키미디어 공용 이미지 출처 수집.

입력: data/raw/wikidata.json
출력: data/raw/wikipedia.json  {slug: {en:{extract,url}, ko:{...}, image:{url,artist,license,source}}}
라이선스: 위키백과 본문 CC BY-SA 4.0 → 문장을 그대로 서비스에 쓰지 않고 LLM 초안의 '근거 자료'로만 사용,
         sources 테이블에 URL·라이선스 기록. 이미지는 파일별 라이선스·작가를 image_credit 에 저장.
"""
from __future__ import annotations

import re
from urllib.parse import quote

from common import RAW, Http, chunks, read_json, write_json

COMMONS_API = "https://commons.wikimedia.org/w/api.php"


def summary(http: Http, lang: str, title: str) -> dict | None:
    try:
        r = http.get(f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{quote(title.replace(' ', '_'), safe='')}")
    except Exception as e:  # 404 등
        print(f"  ⚠ {lang}:{title} 요약 실패 ({e})")
        return None
    if r.get("type") == "disambiguation":
        return None
    return {"title": r.get("title"), "extract": r.get("extract"), "description": r.get("description"),
            "url": r.get("content_urls", {}).get("desktop", {}).get("page"), "license": "CC BY-SA 4.0"}


def strip_html(s: str | None) -> str | None:
    return re.sub(r"<[^>]+>", "", s).strip() if s else s


def image_credits(http: Http, files: list[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for batch in chunks(files, 40):
        r = http.get(COMMONS_API, params={
            "action": "query", "format": "json", "formatversion": 2, "prop": "imageinfo",
            "iiprop": "url|extmetadata", "iiurlwidth": 800,
            "titles": "|".join(f"File:{f}" for f in batch)})
        for p in r.get("query", {}).get("pages", []):
            ii = (p.get("imageinfo") or [{}])[0]
            meta = ii.get("extmetadata", {})
            name = p["title"].removeprefix("File:")
            out[name] = {
                "url": ii.get("thumburl") or ii.get("url"),
                "page": ii.get("descriptionurl"),
                "artist": strip_html(meta.get("Artist", {}).get("value")),
                "license": meta.get("LicenseShortName", {}).get("value"),
            }
    return out


def main() -> None:
    http = Http(min_interval=0.4)
    wd = read_json(RAW / "wikidata.json", {})
    if not wd:
        raise SystemExit("먼저 s01_wikidata.py 를 실행하세요")
    out = {}
    for slug, r in wd.items():
        out[slug] = {"en": summary(http, "en", r["en_title"]),
                     "ko": summary(http, "ko", r["ko_title"]) if r.get("ko_title") else None}
    files = sorted({r["image_file"].replace("%20", " ") for r in wd.values() if r.get("image_file")})
    from urllib.parse import unquote
    creds = image_credits(http, [unquote(f) for f in files])
    for slug, r in wd.items():
        f = r.get("image_file")
        out[slug]["image"] = creds.get(unquote(f).replace("_", " ")) or creds.get(unquote(f)) if f else None
    write_json(RAW / "wikipedia.json", out)
    no_ko = [s for s, v in out.items() if not v["ko"]]
    print(f"✔ 요약 {len(out)}건 → data/raw/wikipedia.json (한국어 문서 없음 {len(no_ko)}건: LLM이 영문 근거로 한국어 초안 작성)")


if __name__ == "__main__":
    main()
