"""② 위키백과 요약(ko/en, 힌트가 다른 언어면 그 언어도) + 위키미디어 공용 이미지 출처 수집.

입력: data/raw/wikidata.json, (있으면) data/seed/image_overrides.csv
출력: data/raw/wikipedia.json  {slug: {en:{extract,url}, ko:{...}, image:{url,page,artist,license,file,source}}}
라이선스: 위키백과 본문 CC BY-SA 4.0 → 문장을 그대로 서비스에 쓰지 않고 LLM 초안의 '근거 자료'로만 사용,
         sources 테이블에 URL·라이선스 기록. 이미지는 파일별 라이선스·작가를 image_credit 에 저장.

대표 이미지 고르는 순서 (image.source):
  1) "override"  — data/seed/image_overrides.csv (slug, commons_file, reason). 사람이 고른 공용 파일
  2) "p18"       — Wikidata 대표 이미지(P18)
  3) "pageimage" — P18 이 없거나 자유 라이선스가 아니면 근거 문서의 대표 이미지(원래 언어 → en → ko)
어느 경로든 공용(Commons) extmetadata 의 LicenseShortName 이 자유 라이선스(CC0 · 퍼블릭 도메인 · CC BY · CC BY-SA)일 때만 쓴다.
GFDL 단독·NC·ND·공정 이용(위키백과 로컬 파일, 공용에 없음)은 거절하고 다음 후보로 넘어간다.
"""
from __future__ import annotations

import re
from urllib.parse import quote, unquote

from common import RAW, SEED, Http, chunks, read_csv, read_json, write_json

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
OVERRIDES = SEED / "image_overrides.csv"
NO_IMAGE = "-"  # image_overrides.csv 의 commons_file 이 "-" 면 사진을 쓰지 않는다


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


def file_key(name: str) -> str:
    """공용 파일명 정규화: URL 인코딩·밑줄·'File:' 접두어 차이를 없앤다 ("A_b%20c.jpg" → "A b c.jpg")."""
    name = unquote(name).removeprefix("File:").replace("_", " ").strip()
    return name[:1].upper() + name[1:]


def is_free_license(short_name: str | None) -> bool:
    """데이터 소스 레지스트리(12 문서) 기준: CC0 · 퍼블릭 도메인 · CC BY · CC BY-SA 만 허용."""
    s = (short_name or "").strip().lower()
    if not s or re.search(r"\b(nc|nd)\b", s):
        return False
    return s.startswith(("cc0", "cc by", "cc-by", "public domain", "pd", "cc-pd", "cc pdm"))


def image_credits(http: Http, files: list[str]) -> dict[str, dict]:
    """공용 파일 → {정규화 파일명: {url, page, artist, license, file}}. 공용에 없는 파일(로컬·삭제)은 빠진다."""
    out: dict[str, dict] = {}
    for batch in chunks(sorted({file_key(f) for f in files}), 40):
        r = http.get(COMMONS_API, params={
            "action": "query", "format": "json", "formatversion": 2, "prop": "imageinfo", "redirects": 1,
            "iiprop": "url|extmetadata", "iiurlwidth": 800,
            "titles": "|".join(f"File:{f}" for f in batch)})
        q = r.get("query", {})
        alias = {file_key(m["to"]): file_key(m["from"]) for step in ("normalized", "redirects") for m in q.get(step, [])}
        for p in q.get("pages", []):
            if p.get("missing") or not p.get("imageinfo"):
                continue
            ii = p["imageinfo"][0]
            meta = ii.get("extmetadata", {})
            name = file_key(p["title"])
            cred = {
                "url": ii.get("thumburl") or ii.get("url"),
                "page": ii.get("descriptionurl"),
                "artist": strip_html(meta.get("Artist", {}).get("value")),
                "license": meta.get("LicenseShortName", {}).get("value"),
                "file": name,
            }
            out[name] = cred
            if name in alias:  # 요청한 이름이 리다이렉트·정규화된 경우 원래 이름으로도 찾게
                out[alias[name]] = cred
    return out


def page_image(http: Http, lang: str, title: str) -> str | None:
    """위키백과 문서의 대표 이미지(pageimages) 파일명. 공용 파일인지는 image_credits 로 다시 확인한다."""
    r = http.get(f"https://{lang}.wikipedia.org/w/api.php", params={
        "action": "query", "format": "json", "formatversion": 2, "redirects": 1,
        "prop": "pageimages", "piprop": "original|name", "titles": title})
    for p in r.get("query", {}).get("pages", []):
        if p.get("pageimage"):
            return p["pageimage"]
    return None


def load_overrides() -> dict[str, dict]:
    if not OVERRIDES.exists():
        return {}
    return {r["slug"].strip(): {"file": r["commons_file"].strip(), "reason": (r.get("reason") or "").strip()}
            for r in read_csv(OVERRIDES) if (r.get("slug") or "").strip() and (r.get("commons_file") or "").strip()}


def article_candidates(r: dict) -> list[tuple[str, str]]:
    """근거 문서 순서: s01 이 해석한 원래 언어 문서 → en → ko (중복 제거)."""
    out: list[tuple[str, str]] = []
    for lang, title in ((r.get("src_lang", "en"), r.get("src_title")), ("en", r.get("en_title")), ("ko", r.get("ko_title"))):
        if title and (lang, title) not in out:
            out.append((lang, title))
    return out


def choose_images(http: Http, wd: dict[str, dict], overrides: dict[str, dict]) -> tuple[dict[str, dict | None], list[str]]:
    """slug → image(+source). 거절 사유는 notes 로 돌려준다."""
    notes: list[str] = []
    creds = image_credits(http, [r["image_file"] for r in wd.values() if r.get("image_file")]
                          + [o["file"] for o in overrides.values() if o["file"] != NO_IMAGE])

    def accept(slug: str, f: str, source: str, **extra) -> dict | None:
        c = creds.get(file_key(f))
        if not c:
            notes.append(f"{slug}: {source} '{file_key(f)}' 공용에 없음(로컬·공정 이용 파일 등) → 거절")
            return None
        if not is_free_license(c["license"]):
            notes.append(f"{slug}: {source} '{c['file']}' 라이선스 '{c['license']}' 는 허용 목록 밖 → 거절")
            return None
        return {**c, "source": source, **extra}

    images: dict[str, dict | None] = {}
    need_fallback: list[str] = []
    for slug, r in wd.items():
        img = None
        if overrides.get(slug, {}).get("file") == NO_IMAGE:
            # 사람이 "사진 없음"으로 정한 음식 — 다른 나라 사진·인물 사진보다 국가색 카드가 낫다
            notes.append(f"{slug}: override '-' → 사진 없이")
            images[slug] = None
            continue
        if slug in overrides:
            o = overrides[slug]
            img = accept(slug, o["file"], "override", reason=o["reason"])
        if not img and r.get("image_file"):
            img = accept(slug, r["image_file"], "p18")
        images[slug] = img
        if not img:
            need_fallback.append(slug)

    # P18 이 없거나 거절된 음식만 문서 대표 이미지를 찾는다 (원래 언어 → en → ko)
    found: dict[str, list[tuple[str, str, str]]] = {}
    for slug in need_fallback:
        for lang, title in article_candidates(wd[slug]):
            f = page_image(http, lang, title)
            if f:
                found.setdefault(slug, []).append((lang, title, f))
    if found:
        creds.update(image_credits(http, [f for cands in found.values() for _, _, f in cands]))
    for slug in need_fallback:
        for lang, title, f in found.get(slug, []):
            img = accept(slug, f, "pageimage", article=f"{lang}:{title}")
            if img:
                images[slug] = img
                break
    return images, notes


def main() -> None:
    http = Http(min_interval=0.4)
    wd = read_json(RAW / "wikidata.json", {})
    if not wd:
        raise SystemExit("먼저 s01_wikidata.py 를 실행하세요")
    out = {}
    for slug, r in wd.items():
        out[slug] = {"en": summary(http, "en", r["en_title"]) if r.get("en_title") else None,
                     "ko": summary(http, "ko", r["ko_title"]) if r.get("ko_title") else None}
        src = r.get("src_lang", "en")
        if src not in ("en", "ko"):  # "es:제목" 힌트 → 스페인어 문서가 주 근거
            out[slug][src] = summary(http, src, r["src_title"])

    overrides = load_overrides()
    unknown = sorted(set(overrides) - set(wd))
    if unknown:
        print(f"  ⚠ image_overrides.csv 에 없는 slug: {', '.join(unknown)}")
    images, notes = choose_images(http, wd, overrides)
    for slug in wd:
        out[slug]["image"] = images.get(slug)
    write_json(RAW / "wikipedia.json", out)

    no_ko = [s for s, v in out.items() if not v["ko"]]
    print(f"✔ 요약 {len(out)}건 → data/raw/wikipedia.json (한국어 문서 없음 {len(no_ko)}건: LLM이 영문 근거로 한국어 초안 작성)")
    by_src: dict[str, int] = {}
    for v in out.values():
        if v["image"]:
            by_src[v["image"]["source"]] = by_src.get(v["image"]["source"], 0) + 1
    no_img = [s for s, v in out.items() if not v["image"]]
    print(f"✔ 대표 이미지 {len(out) - len(no_img)}/{len(out)}건 (" + " · ".join(f"{k} {n}" for k, n in sorted(by_src.items())) + ")")
    for n in notes:
        print(f"  ℹ {n}")
    if no_img:
        print(f"⚠ 이미지 없음 {len(no_img)}건: {', '.join(no_img)} (image_overrides.csv 로 지정 가능)")


if __name__ == "__main__":
    main()
