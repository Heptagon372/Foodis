"""③ TheMealDB 재료 교차검증용 수집 (선택).

- 테스트 키 '1'은 개발·교육용. 상용화 시 Patreon 유료 키 필요. 무료 키는 목록 100건 제한.
- FOODIS DB에 TheMealDB 본문·이미지를 저장하지 않는다. '재료 목록 교차검증' 근거로만 쓰고 sources 에 reference 로 기록.
출력: data/raw/themealdb.json {slug: {id, name, area, ingredients[]}}
"""
from __future__ import annotations

import os

from common import RAW, SEED, Http, read_csv, write_json

KEY = os.environ.get("THEMEALDB_KEY", "1")
BASE = f"https://www.themealdb.com/api/json/v1/{KEY}"


def ingredients_of(meal: dict) -> list[str]:
    return [meal[f"strIngredient{i}"].strip() for i in range(1, 21)
            if meal.get(f"strIngredient{i}") and meal[f"strIngredient{i}"].strip()]


def main() -> None:
    http = Http(min_interval=0.3)
    out = {}
    for t in read_csv(SEED / "dish_targets.csv"):
        res = http.get(f"{BASE}/search.php", params={"s": t["name_en"]})
        meals = res.get("meals") or []
        if not meals:
            continue
        m = meals[0]
        out[t["slug"]] = {"id": m["idMeal"], "name": m["strMeal"], "area": m.get("strArea"),
                          "ingredients": ingredients_of(m),
                          "url": f"https://www.themealdb.com/meal/{m['idMeal']}"}
    write_json(RAW / "themealdb.json", out)
    print(f"✔ TheMealDB 매칭 {len(out)}건 → data/raw/themealdb.json (교차검증 전용)")


if __name__ == "__main__":
    main()
