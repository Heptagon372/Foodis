"""FOODIS 데이터 수집 공통 모듈: 설정, HTTP 세션(재시도·Retry-After), 파일 캐시, CSV/JSON 입출력."""
from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path
from typing import Any, Iterable

import requests

# 한국어 Windows 콘솔(cp949)은 ✔·✎ 같은 기호를 못 찍어 스크립트가 죽는다 → UTF-8 고정
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SEED, RAW, DRAFT, FINAL = DATA / "seed", DATA / "raw", DATA / "draft", DATA / "final"
for d in (RAW, DRAFT, FINAL):
    d.mkdir(parents=True, exist_ok=True)


def load_env(path: Path = ROOT / ".env") -> None:
    """의존성 없이 .env 로드 (이미 설정된 환경변수는 덮어쓰지 않음)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()

USER_AGENT = os.environ.get(
    "FOODIS_USER_AGENT",
    "FoodisDataBot/0.1 (student project; contact: set FOODIS_USER_AGENT in .env)",
)
TASTE_TAGS = [
    "spicy", "fermented", "soupy", "sweet", "sour", "salty", "umami", "smoky", "herbal",
    "creamy", "crispy", "rich", "fresh", "nutty", "grilled", "fried", "rice", "noodle",
    "bread", "dumpling", "meat", "seafood", "vegetable", "legume", "dairy", "street_food",
]
DIET_KEYS = ["vegan", "vegetarian", "halal", "gluten_free", "dairy_free"]
DIET_LEVELS = ["yes", "depends", "no", "unknown"]
ALLERGENS = ["nuts", "peanut", "shellfish", "fish", "egg", "soy", "wheat", "dairy", "sesame"]
# 근거로 쓰는 위키백과 언어. 영어 문서가 없거나 부실한 음식(볼리비아·페루 등)은 dish_targets 에 "es:제목" 처럼 적는다
WIKI_LANGS = ["en", "ko", "es", "pt", "fr"]


def parse_wiki_hint(hint: str) -> tuple[str, str]:
    """"es:Majadito" → ("es", "Majadito"), "Kimchi" → ("en", "Kimchi")"""
    m = re.match(r"^([a-z]{2}):(.+)$", hint.strip())
    return (m.group(1), m.group(2)) if m and m.group(1) in WIKI_LANGS else ("en", hint.strip())


class Http:
    """User-Agent 고정, 429/5xx 재시도(Retry-After 준수), 최소 요청 간격, 디스크 캐시."""

    def __init__(self, min_interval: float = 0.4, cache_dir: Path | None = RAW / "_http_cache"):
        self.s = requests.Session()
        self.s.headers["User-Agent"] = USER_AGENT
        self.min_interval = float(os.environ.get("FOODIS_HTTP_INTERVAL", min_interval))
        self._last = 0.0
        self.cache_dir = cache_dir
        if cache_dir:
            cache_dir.mkdir(parents=True, exist_ok=True)

    def _key(self, method: str, url: str, params: Any, body: Any) -> Path:
        h = hashlib.sha256(json.dumps([method, url, params, body], sort_keys=True, default=str).encode()).hexdigest()[:24]
        return self.cache_dir / f"{h}.json"  # type: ignore[operator]

    def request(self, method: str, url: str, *, params=None, data=None, json_body=None,
                headers=None, cache: bool = True, retries: int = 5) -> Any:
        key = self._key(method, url, params, data or json_body) if (cache and self.cache_dir) else None
        if key and key.exists():
            return json.loads(key.read_text(encoding="utf-8"))
        for attempt in range(retries):
            wait = self.min_interval - (time.time() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.time()
            r = self.s.request(method, url, params=params, data=data, json=json_body, headers=headers, timeout=60)
            if r.status_code == 429 or r.status_code >= 500:
                retry_after = r.headers.get("Retry-After")
                delay = float(retry_after) if retry_after and retry_after.isdigit() else 2 ** attempt
                print(f"  ↻ {r.status_code} {url[:60]}… {delay:.0f}s 후 재시도")
                time.sleep(delay)
                continue
            r.raise_for_status()
            out = r.json() if r.content and r.content.strip() else None
            if key:
                key.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
            return out
        raise RuntimeError(f"요청 실패: {method} {url}")

    def get(self, url: str, **kw) -> Any:
        return self.request("GET", url, **kw)

    def post(self, url: str, **kw) -> Any:
        return self.request("POST", url, **kw)


def read_csv(path: Path) -> list[dict[str, str]]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def write_csv(path: Path, rows: Iterable[dict[str, Any]], fields: list[str]) -> None:
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: (json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else v) for k, v in r.items()})


def read_json(path: Path, default: Any = None) -> Any:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def write_json(path: Path, obj: Any) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def chunks(seq: list, n: int):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def require_env(*names: str) -> None:
    missing = [n for n in names if not os.environ.get(n)]
    if missing:
        raise SystemExit(f".env 에 {', '.join(missing)} 를 설정하세요 (.env.example 참고)")
