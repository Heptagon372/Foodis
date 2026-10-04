"""나라 미정 음식의 country_code 를 Wikidata description·Wikipedia 첫 문장에서 추론.

출력 → data/raw/country_inferred.json  {slug: {country_code, source}}
AI 없이 규칙 기반. 각 추론은 origin_note 에 출처가 남아 검수 때 확인 가능.
"""
from __future__ import annotations

import json
import re
from collections import Counter

from common import RAW, SEED, read_csv, read_json, write_json

ADJ = {
    "Korean": "KR", "Japanese": "JP", "Chinese": "CN", "Taiwanese": "TW", "Hong Kong": "HK", "Macanese": "MO",
    "Thai": "TH", "Vietnamese": "VN", "Indonesian": "ID", "Malaysian": "MY", "Singaporean": "SG", "Filipino": "PH", "Bruneian": "BN",
    "Indian": "IN", "Pakistani": "PK", "Bangladeshi": "BD", "Sri Lankan": "LK", "Nepali": "NP", "Nepalese": "NP", "Bhutanese": "BT", "Maldivian": "MV",
    "Afghan": "AF", "Iranian": "IR", "Persian": "IR", "Iraqi": "IQ", "Turkish": "TR", "Lebanese": "LB", "Syrian": "SY",
    "Israeli": "IL", "Palestinian": "PS", "Jordanian": "JO", "Saudi": "SA", "Emirati": "AE", "Yemeni": "YE", "Omani": "OM", "Qatari": "QA", "Bahraini": "BH", "Kuwaiti": "KW",
    "Egyptian": "EG", "Moroccan": "MA", "Tunisian": "TN", "Algerian": "DZ", "Libyan": "LY", "Sudanese": "SD",
    "Ethiopian": "ET", "Eritrean": "ER", "Kenyan": "KE", "Nigerian": "NG", "Ghanaian": "GH", "Senegalese": "SN", "Ivorian": "CI",
    "South African": "ZA", "Zimbabwean": "ZW", "Zambian": "ZM", "Tanzanian": "TZ", "Ugandan": "UG", "Rwandan": "RW",
    "Cameroonian": "CM", "Malian": "ML", "Guinean": "GN", "Burkinabe": "BF", "Beninese": "BJ", "Togolese": "TG",
    "Mozambican": "MZ", "Angolan": "AO", "Somali": "SO", "Djiboutian": "DJ", "Mauritanian": "MR", "Chadian": "TD",
    "Italian": "IT", "French": "FR", "Spanish": "ES", "Portuguese": "PT", "Greek": "GR", "German": "DE",
    "Austrian": "AT", "Swiss": "CH",
    "British": "GB", "English": "GB", "Scottish": "GB", "Welsh": "GB", "Irish": "IE", "Dutch": "NL", "Belgian": "BE", "Luxembourgish": "LU",
    "Polish": "PL", "Czech": "CZ", "Slovak": "SK", "Hungarian": "HU", "Romanian": "RO", "Bulgarian": "BG",
    "Croatian": "HR", "Serbian": "RS", "Slovenian": "SI", "Bosnian": "BA", "Albanian": "AL", "Macedonian": "MK",
    "Montenegrin": "ME", "Kosovar": "XK", "Moldovan": "MD",
    "Russian": "RU", "Ukrainian": "UA", "Belarusian": "BY", "Georgian": "GE", "Armenian": "AM",
    "Azerbaijani": "AZ", "Kazakh": "KZ", "Uzbek": "UZ", "Tajik": "TJ", "Turkmen": "TM", "Kyrgyz": "KG",
    "Swedish": "SE", "Norwegian": "NO", "Danish": "DK", "Finnish": "FI", "Icelandic": "IS",
    "Estonian": "EE", "Latvian": "LV", "Lithuanian": "LT",
    "American": "US", "Mexican": "MX", "Canadian": "CA", "Cuban": "CU", "Jamaican": "JM", "Dominican": "DO",
    "Puerto Rican": "PR", "Haitian": "HT", "Trinidadian": "TT", "Bahamian": "BS", "Barbadian": "BB", "Grenadian": "GD",
    "Brazilian": "BR", "Argentine": "AR", "Argentinian": "AR", "Chilean": "CL", "Peruvian": "PE", "Colombian": "CO",
    "Venezuelan": "VE", "Ecuadorian": "EC", "Bolivian": "BO", "Uruguayan": "UY", "Paraguayan": "PY",
    "Surinamese": "SR", "Guyanese": "GY",
    "Guatemalan": "GT", "Honduran": "HN", "Nicaraguan": "NI", "Costa Rican": "CR", "Panamanian": "PA",
    "Salvadoran": "SV", "Belizean": "BZ",
    "Australian": "AU", "New Zealand": "NZ", "Fijian": "FJ", "Samoan": "WS", "Tongan": "TO",
    "Burmese": "MM", "Myanmar": "MM", "Cambodian": "KH", "Laotian": "LA", "Lao": "LA",
    "Mongolian": "MN", "North Korean": "KP",
    "Catalan": "ES", "Basque": "ES", "Galician": "ES", "Andalusian": "ES",
    "Sicilian": "IT", "Neapolitan": "IT", "Sardinian": "IT", "Bavarian": "DE",
    "Yoruba": "NG", "Igbo": "NG", "Hausa": "NG", "Zulu": "ZA", "Swahili": "KE", "Berber": "MA", "Amazigh": "MA",
}


def main() -> None:
    countries = {c["code"] for c in read_csv(SEED / "countries.csv")}
    targets = {t["slug"]: t for t in read_csv(SEED / "dish_targets.csv")}
    wd = read_json(RAW / "wikidata.json")
    wp = read_json(RAW / "wikipedia.json")

    for cc, name in [(c["code"], c["name_en"]) for c in read_csv(SEED / "countries.csv")]:
        ADJ.setdefault(name, cc)

    patterns = sorted(ADJ.keys(), key=len, reverse=True)
    valid = {k: v for k, v in ADJ.items() if v in countries}
    rx = re.compile(r"\b(" + "|".join(re.escape(p) for p in patterns if p in valid) + r")\b")

    def first_country(text: str) -> tuple[str, str] | None:
        if not text:
            return None
        first = re.split(r"(?<=[a-z])\.\s+[A-Z]", text, maxsplit=1)[0][:300]
        m = rx.search(first)
        return (valid[m.group(1)], m.group(1)) if m else None

    def guess(d: dict, w: dict) -> tuple[str, str] | None:
        for cl in d.get("class_labels", []):
            m = re.match(r"(.+?) cuisine$", cl) or re.match(r"cuisine of (.+)$", cl)
            if m and m.group(1) in valid:
                return valid[m.group(1)], f"class:{cl}"
        for lang in ("en", "ko"):
            desc = (w.get(lang) or {}).get("description") or ""
            r = first_country(desc)
            if r:
                return r[0], f"desc.{lang}:{r[1]}"
        for lang in ("en", "ko"):
            ex = (w.get(lang) or {}).get("extract") or ""
            r = first_country(ex)
            if r:
                return r[0], f"wp.{lang}:{r[1]}"
        return None

    inferred: dict[str, dict] = {}
    still: list[tuple[str, str]] = []
    for s, t in targets.items():
        d = wd.get(s)
        if not d or d.get("needs_review"):
            continue
        cc = t["country_code"] if t["country_code"] in countries else next((o for o in d.get("origin_codes", []) if o in countries), None)
        if cc:
            continue
        w = wp.get(s) or {}
        g = guess(d, w)
        if g:
            inferred[s] = {"country_code": g[0], "source": g[1]}
        else:
            still.append((s, t["name_en"]))

    print(f"추론 성공: {len(inferred)} / 여전히 미정: {len(still)}")
    print("소스별:", Counter(v["source"].split(":")[0] for v in inferred.values()).most_common())
    print("국가 상위:", Counter(v["country_code"] for v in inferred.values()).most_common(15))

    write_json(RAW / "country_inferred.json", inferred)
    print(f"→ data/raw/country_inferred.json ({len(inferred)}건)")

    # 샘플 검증
    print("\n[검증 샘플]")
    for s in ["samosa", "jambalaya", "qatayef", "pudding", "spatzle", "chicken-kiev",
              "khichdi", "baozi", "pad-thai", "pho", "ramen", "sushi", "croquette",
              "turkish-delight", "chicken-curry", "sorrel-soup"]:
        if s in inferred:
            print(f"  {s:<25} → {inferred[s]['country_code']} ({inferred[s]['source']})")

    # 미정 샘플 (대부분 일반 범주)
    print("\n[여전히 미정 샘플]")
    for s, n in still[:20]:
        print(f"  {s:<25} {n}")


if __name__ == "__main__":
    main()
