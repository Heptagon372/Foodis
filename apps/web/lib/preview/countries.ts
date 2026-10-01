// foodis-data/data/seed/countries.csv 에서 생성 (tools/gen-preview-countries.mjs). 시드가 바뀌면 다시 생성.
import type { Country } from "@/lib/content/types";

export const PREVIEW_COUNTRIES: Country[] = [
  {
    "code": "KR",
    "name_ko": "대한민국",
    "name_en": "South Korea",
    "region": "East Asia",
    "continent_group": "asia",
    "flag_emoji": "🇰🇷",
    "accent_color": "#C8384A"
  },
  {
    "code": "JP",
    "name_ko": "일본",
    "name_en": "Japan",
    "region": "East Asia",
    "continent_group": "asia",
    "flag_emoji": "🇯🇵",
    "accent_color": "#C2453F"
  },
  {
    "code": "CN",
    "name_ko": "중국",
    "name_en": "China",
    "region": "East Asia",
    "continent_group": "asia",
    "flag_emoji": "🇨🇳",
    "accent_color": "#C9473A"
  },
  {
    "code": "TH",
    "name_ko": "태국",
    "name_en": "Thailand",
    "region": "Southeast Asia",
    "continent_group": "asia",
    "flag_emoji": "🇹🇭",
    "accent_color": "#3D4F8C"
  },
  {
    "code": "VN",
    "name_ko": "베트남",
    "name_en": "Vietnam",
    "region": "Southeast Asia",
    "continent_group": "asia",
    "flag_emoji": "🇻🇳",
    "accent_color": "#C7402E"
  },
  {
    "code": "ID",
    "name_ko": "인도네시아",
    "name_en": "Indonesia",
    "region": "Southeast Asia",
    "continent_group": "asia",
    "flag_emoji": "🇮🇩",
    "accent_color": "#C0392B"
  },
  {
    "code": "PH",
    "name_ko": "필리핀",
    "name_en": "Philippines",
    "region": "Southeast Asia",
    "continent_group": "asia",
    "flag_emoji": "🇵🇭",
    "accent_color": "#2F55A4"
  },
  {
    "code": "IN",
    "name_ko": "인도",
    "name_en": "India",
    "region": "South Asia",
    "continent_group": "asia",
    "flag_emoji": "🇮🇳",
    "accent_color": "#E08A3C"
  },
  {
    "code": "NP",
    "name_ko": "네팔",
    "name_en": "Nepal",
    "region": "South Asia",
    "continent_group": "asia",
    "flag_emoji": "🇳🇵",
    "accent_color": "#B53A46"
  },
  {
    "code": "UZ",
    "name_ko": "우즈베키스탄",
    "name_en": "Uzbekistan",
    "region": "Central Asia",
    "continent_group": "asia",
    "flag_emoji": "🇺🇿",
    "accent_color": "#2F8FB3"
  },
  {
    "code": "IT",
    "name_ko": "이탈리아",
    "name_en": "Italy",
    "region": "Southern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇮🇹",
    "accent_color": "#3E8E5A"
  },
  {
    "code": "FR",
    "name_ko": "프랑스",
    "name_en": "France",
    "region": "Western Europe",
    "continent_group": "europe",
    "flag_emoji": "🇫🇷",
    "accent_color": "#3A5BA0"
  },
  {
    "code": "ES",
    "name_ko": "스페인",
    "name_en": "Spain",
    "region": "Southern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇪🇸",
    "accent_color": "#C9A227"
  },
  {
    "code": "GR",
    "name_ko": "그리스",
    "name_en": "Greece",
    "region": "Southern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇬🇷",
    "accent_color": "#3F6FB5"
  },
  {
    "code": "AT",
    "name_ko": "오스트리아",
    "name_en": "Austria",
    "region": "Central Europe",
    "continent_group": "europe",
    "flag_emoji": "🇦🇹",
    "accent_color": "#B8424A"
  },
  {
    "code": "PL",
    "name_ko": "폴란드",
    "name_en": "Poland",
    "region": "Central Europe",
    "continent_group": "europe",
    "flag_emoji": "🇵🇱",
    "accent_color": "#C24A5A"
  },
  {
    "code": "GE",
    "name_ko": "조지아",
    "name_en": "Georgia",
    "region": "Caucasus",
    "continent_group": "europe",
    "flag_emoji": "🇬🇪",
    "accent_color": "#B8393F"
  },
  {
    "code": "TR",
    "name_ko": "튀르키예",
    "name_en": "Türkiye",
    "region": "Western Asia",
    "continent_group": "mena_africa",
    "flag_emoji": "🇹🇷",
    "accent_color": "#C13A3A"
  },
  {
    "code": "LB",
    "name_ko": "레바논",
    "name_en": "Lebanon",
    "region": "Middle East",
    "continent_group": "mena_africa",
    "flag_emoji": "🇱🇧",
    "accent_color": "#3C8A55"
  },
  {
    "code": "IR",
    "name_ko": "이란",
    "name_en": "Iran",
    "region": "Middle East",
    "continent_group": "mena_africa",
    "flag_emoji": "🇮🇷",
    "accent_color": "#3F8F5C"
  },
  {
    "code": "EG",
    "name_ko": "이집트",
    "name_en": "Egypt",
    "region": "North Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇪🇬",
    "accent_color": "#B5484A"
  },
  {
    "code": "MA",
    "name_ko": "모로코",
    "name_en": "Morocco",
    "region": "North Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇲🇦",
    "accent_color": "#B83B3B"
  },
  {
    "code": "ET",
    "name_ko": "에티오피아",
    "name_en": "Ethiopia",
    "region": "Horn of Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇪🇹",
    "accent_color": "#3A7D44"
  },
  {
    "code": "ZA",
    "name_ko": "남아프리카공화국",
    "name_en": "South Africa",
    "region": "Southern Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇿🇦",
    "accent_color": "#2E7D5B"
  },
  {
    "code": "MX",
    "name_ko": "멕시코",
    "name_en": "Mexico",
    "region": "North America",
    "continent_group": "americas",
    "flag_emoji": "🇲🇽",
    "accent_color": "#2E7D52"
  },
  {
    "code": "US",
    "name_ko": "미국",
    "name_en": "United States",
    "region": "North America",
    "continent_group": "americas",
    "flag_emoji": "🇺🇸",
    "accent_color": "#3B4E8C"
  },
  {
    "code": "PE",
    "name_ko": "페루",
    "name_en": "Peru",
    "region": "South America",
    "continent_group": "americas",
    "flag_emoji": "🇵🇪",
    "accent_color": "#C2414B"
  },
  {
    "code": "BO",
    "name_ko": "볼리비아",
    "name_en": "Bolivia",
    "region": "South America",
    "continent_group": "americas",
    "flag_emoji": "🇧🇴",
    "accent_color": "#3E8A4E"
  },
  {
    "code": "BR",
    "name_ko": "브라질",
    "name_en": "Brazil",
    "region": "South America",
    "continent_group": "americas",
    "flag_emoji": "🇧🇷",
    "accent_color": "#3E9A5A"
  },
  {
    "code": "AR",
    "name_ko": "아르헨티나",
    "name_en": "Argentina",
    "region": "South America",
    "continent_group": "americas",
    "flag_emoji": "🇦🇷",
    "accent_color": "#5DA3D5"
  },
  {
    "code": "MN",
    "name_ko": "몽골",
    "name_en": "Mongolia",
    "region": "East Asia",
    "continent_group": "asia",
    "flag_emoji": "🇲🇳",
    "accent_color": "#C4363D"
  },
  {
    "code": "TW",
    "name_ko": "대만",
    "name_en": "Taiwan",
    "region": "East Asia",
    "continent_group": "asia",
    "flag_emoji": "🇹🇼",
    "accent_color": "#3A4FA0"
  },
  {
    "code": "MY",
    "name_ko": "말레이시아",
    "name_en": "Malaysia",
    "region": "Southeast Asia",
    "continent_group": "asia",
    "flag_emoji": "🇲🇾",
    "accent_color": "#2F4A93"
  },
  {
    "code": "SG",
    "name_ko": "싱가포르",
    "name_en": "Singapore",
    "region": "Southeast Asia",
    "continent_group": "asia",
    "flag_emoji": "🇸🇬",
    "accent_color": "#C8384A"
  },
  {
    "code": "KH",
    "name_ko": "캄보디아",
    "name_en": "Cambodia",
    "region": "Southeast Asia",
    "continent_group": "asia",
    "flag_emoji": "🇰🇭",
    "accent_color": "#2F4A93"
  },
  {
    "code": "LA",
    "name_ko": "라오스",
    "name_en": "Laos",
    "region": "Southeast Asia",
    "continent_group": "asia",
    "flag_emoji": "🇱🇦",
    "accent_color": "#C23B3B"
  },
  {
    "code": "MM",
    "name_ko": "미얀마",
    "name_en": "Myanmar",
    "region": "Southeast Asia",
    "continent_group": "asia",
    "flag_emoji": "🇲🇲",
    "accent_color": "#C99A2E"
  },
  {
    "code": "PK",
    "name_ko": "파키스탄",
    "name_en": "Pakistan",
    "region": "South Asia",
    "continent_group": "asia",
    "flag_emoji": "🇵🇰",
    "accent_color": "#2E6E45"
  },
  {
    "code": "BD",
    "name_ko": "방글라데시",
    "name_en": "Bangladesh",
    "region": "South Asia",
    "continent_group": "asia",
    "flag_emoji": "🇧🇩",
    "accent_color": "#2E6E45"
  },
  {
    "code": "LK",
    "name_ko": "스리랑카",
    "name_en": "Sri Lanka",
    "region": "South Asia",
    "continent_group": "asia",
    "flag_emoji": "🇱🇰",
    "accent_color": "#B5603A"
  },
  {
    "code": "BT",
    "name_ko": "부탄",
    "name_en": "Bhutan",
    "region": "South Asia",
    "continent_group": "asia",
    "flag_emoji": "🇧🇹",
    "accent_color": "#D98A3A"
  },
  {
    "code": "MV",
    "name_ko": "몰디브",
    "name_en": "Maldives",
    "region": "South Asia",
    "continent_group": "asia",
    "flag_emoji": "🇲🇻",
    "accent_color": "#B83B3B"
  },
  {
    "code": "AF",
    "name_ko": "아프가니스탄",
    "name_en": "Afghanistan",
    "region": "South Asia",
    "continent_group": "asia",
    "flag_emoji": "🇦🇫",
    "accent_color": "#3E7D45"
  },
  {
    "code": "KZ",
    "name_ko": "카자흐스탄",
    "name_en": "Kazakhstan",
    "region": "Central Asia",
    "continent_group": "asia",
    "flag_emoji": "🇰🇿",
    "accent_color": "#3AA3C9"
  },
  {
    "code": "KG",
    "name_ko": "키르기스스탄",
    "name_en": "Kyrgyzstan",
    "region": "Central Asia",
    "continent_group": "asia",
    "flag_emoji": "🇰🇬",
    "accent_color": "#C8383A"
  },
  {
    "code": "TJ",
    "name_ko": "타지키스탄",
    "name_en": "Tajikistan",
    "region": "Central Asia",
    "continent_group": "asia",
    "flag_emoji": "🇹🇯",
    "accent_color": "#C8383A"
  },
  {
    "code": "TM",
    "name_ko": "투르크메니스탄",
    "name_en": "Turkmenistan",
    "region": "Central Asia",
    "continent_group": "asia",
    "flag_emoji": "🇹🇲",
    "accent_color": "#2E7D52"
  },
  {
    "code": "AM",
    "name_ko": "아르메니아",
    "name_en": "Armenia",
    "region": "Caucasus",
    "continent_group": "europe",
    "flag_emoji": "🇦🇲",
    "accent_color": "#D9822B"
  },
  {
    "code": "AZ",
    "name_ko": "아제르바이잔",
    "name_en": "Azerbaijan",
    "region": "Caucasus",
    "continent_group": "europe",
    "flag_emoji": "🇦🇿",
    "accent_color": "#2F8FB3"
  },
  {
    "code": "GB",
    "name_ko": "영국",
    "name_en": "United Kingdom",
    "region": "Northern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇬🇧",
    "accent_color": "#2F3F7F"
  },
  {
    "code": "IE",
    "name_ko": "아일랜드",
    "name_en": "Ireland",
    "region": "Northern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇮🇪",
    "accent_color": "#2E8A55"
  },
  {
    "code": "PT",
    "name_ko": "포르투갈",
    "name_en": "Portugal",
    "region": "Southern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇵🇹",
    "accent_color": "#2E7D45"
  },
  {
    "code": "DE",
    "name_ko": "독일",
    "name_en": "Germany",
    "region": "Western Europe",
    "continent_group": "europe",
    "flag_emoji": "🇩🇪",
    "accent_color": "#C9A227"
  },
  {
    "code": "NL",
    "name_ko": "네덜란드",
    "name_en": "Netherlands",
    "region": "Western Europe",
    "continent_group": "europe",
    "flag_emoji": "🇳🇱",
    "accent_color": "#D36B2A"
  },
  {
    "code": "BE",
    "name_ko": "벨기에",
    "name_en": "Belgium",
    "region": "Western Europe",
    "continent_group": "europe",
    "flag_emoji": "🇧🇪",
    "accent_color": "#C9A227"
  },
  {
    "code": "CH",
    "name_ko": "스위스",
    "name_en": "Switzerland",
    "region": "Western Europe",
    "continent_group": "europe",
    "flag_emoji": "🇨🇭",
    "accent_color": "#C8383A"
  },
  {
    "code": "SE",
    "name_ko": "스웨덴",
    "name_en": "Sweden",
    "region": "Northern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇸🇪",
    "accent_color": "#2F6EA8"
  },
  {
    "code": "NO",
    "name_ko": "노르웨이",
    "name_en": "Norway",
    "region": "Northern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇳🇴",
    "accent_color": "#B8393F"
  },
  {
    "code": "DK",
    "name_ko": "덴마크",
    "name_en": "Denmark",
    "region": "Northern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇩🇰",
    "accent_color": "#C8383A"
  },
  {
    "code": "FI",
    "name_ko": "핀란드",
    "name_en": "Finland",
    "region": "Northern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇫🇮",
    "accent_color": "#2F5FA8"
  },
  {
    "code": "IS",
    "name_ko": "아이슬란드",
    "name_en": "Iceland",
    "region": "Northern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇮🇸",
    "accent_color": "#2F5FA8"
  },
  {
    "code": "CZ",
    "name_ko": "체코",
    "name_en": "Czechia",
    "region": "Central Europe",
    "continent_group": "europe",
    "flag_emoji": "🇨🇿",
    "accent_color": "#2F4F90"
  },
  {
    "code": "SK",
    "name_ko": "슬로바키아",
    "name_en": "Slovakia",
    "region": "Central Europe",
    "continent_group": "europe",
    "flag_emoji": "🇸🇰",
    "accent_color": "#2F4F90"
  },
  {
    "code": "HU",
    "name_ko": "헝가리",
    "name_en": "Hungary",
    "region": "Central Europe",
    "continent_group": "europe",
    "flag_emoji": "🇭🇺",
    "accent_color": "#3E8A4E"
  },
  {
    "code": "RO",
    "name_ko": "루마니아",
    "name_en": "Romania",
    "region": "Eastern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇷🇴",
    "accent_color": "#2F4F90"
  },
  {
    "code": "BG",
    "name_ko": "불가리아",
    "name_en": "Bulgaria",
    "region": "Eastern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇧🇬",
    "accent_color": "#3E8A4E"
  },
  {
    "code": "UA",
    "name_ko": "우크라이나",
    "name_en": "Ukraine",
    "region": "Eastern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇺🇦",
    "accent_color": "#2F6EB5"
  },
  {
    "code": "RU",
    "name_ko": "러시아",
    "name_en": "Russia",
    "region": "Eastern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇷🇺",
    "accent_color": "#2F4F90"
  },
  {
    "code": "LT",
    "name_ko": "리투아니아",
    "name_en": "Lithuania",
    "region": "Northern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇱🇹",
    "accent_color": "#C9A227"
  },
  {
    "code": "LV",
    "name_ko": "라트비아",
    "name_en": "Latvia",
    "region": "Northern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇱🇻",
    "accent_color": "#9E3039"
  },
  {
    "code": "EE",
    "name_ko": "에스토니아",
    "name_en": "Estonia",
    "region": "Northern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇪🇪",
    "accent_color": "#2F6EB5"
  },
  {
    "code": "RS",
    "name_ko": "세르비아",
    "name_en": "Serbia",
    "region": "Southern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇷🇸",
    "accent_color": "#2F4F90"
  },
  {
    "code": "HR",
    "name_ko": "크로아티아",
    "name_en": "Croatia",
    "region": "Southern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇭🇷",
    "accent_color": "#2F4F90"
  },
  {
    "code": "BA",
    "name_ko": "보스니아 헤르체고비나",
    "name_en": "Bosnia and Herzegovina",
    "region": "Southern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇧🇦",
    "accent_color": "#2F4F90"
  },
  {
    "code": "AL",
    "name_ko": "알바니아",
    "name_en": "Albania",
    "region": "Southern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇦🇱",
    "accent_color": "#C8383A"
  },
  {
    "code": "CY",
    "name_ko": "키프로스",
    "name_en": "Cyprus",
    "region": "Southern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇨🇾",
    "accent_color": "#D9822B"
  },
  {
    "code": "MT",
    "name_ko": "몰타",
    "name_en": "Malta",
    "region": "Southern Europe",
    "continent_group": "europe",
    "flag_emoji": "🇲🇹",
    "accent_color": "#C8383A"
  },
  {
    "code": "IL",
    "name_ko": "이스라엘",
    "name_en": "Israel",
    "region": "Middle East",
    "continent_group": "mena_africa",
    "flag_emoji": "🇮🇱",
    "accent_color": "#2F5FA8"
  },
  {
    "code": "JO",
    "name_ko": "요르단",
    "name_en": "Jordan",
    "region": "Middle East",
    "continent_group": "mena_africa",
    "flag_emoji": "🇯🇴",
    "accent_color": "#2E7D45"
  },
  {
    "code": "SA",
    "name_ko": "사우디아라비아",
    "name_en": "Saudi Arabia",
    "region": "Middle East",
    "continent_group": "mena_africa",
    "flag_emoji": "🇸🇦",
    "accent_color": "#2E7D45"
  },
  {
    "code": "AE",
    "name_ko": "아랍에미리트",
    "name_en": "United Arab Emirates",
    "region": "Middle East",
    "continent_group": "mena_africa",
    "flag_emoji": "🇦🇪",
    "accent_color": "#2E7D45"
  },
  {
    "code": "IQ",
    "name_ko": "이라크",
    "name_en": "Iraq",
    "region": "Middle East",
    "continent_group": "mena_africa",
    "flag_emoji": "🇮🇶",
    "accent_color": "#C8383A"
  },
  {
    "code": "SY",
    "name_ko": "시리아",
    "name_en": "Syria",
    "region": "Middle East",
    "continent_group": "mena_africa",
    "flag_emoji": "🇸🇾",
    "accent_color": "#2E7D45"
  },
  {
    "code": "YE",
    "name_ko": "예멘",
    "name_en": "Yemen",
    "region": "Middle East",
    "continent_group": "mena_africa",
    "flag_emoji": "🇾🇪",
    "accent_color": "#C8383A"
  },
  {
    "code": "OM",
    "name_ko": "오만",
    "name_en": "Oman",
    "region": "Middle East",
    "continent_group": "mena_africa",
    "flag_emoji": "🇴🇲",
    "accent_color": "#C8383A"
  },
  {
    "code": "TN",
    "name_ko": "튀니지",
    "name_en": "Tunisia",
    "region": "North Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇹🇳",
    "accent_color": "#C8383A"
  },
  {
    "code": "DZ",
    "name_ko": "알제리",
    "name_en": "Algeria",
    "region": "North Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇩🇿",
    "accent_color": "#2E7D45"
  },
  {
    "code": "LY",
    "name_ko": "리비아",
    "name_en": "Libya",
    "region": "North Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇱🇾",
    "accent_color": "#2E7D45"
  },
  {
    "code": "SD",
    "name_ko": "수단",
    "name_en": "Sudan",
    "region": "North Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇸🇩",
    "accent_color": "#3E7D45"
  },
  {
    "code": "NG",
    "name_ko": "나이지리아",
    "name_en": "Nigeria",
    "region": "West Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇳🇬",
    "accent_color": "#2E8A55"
  },
  {
    "code": "GH",
    "name_ko": "가나",
    "name_en": "Ghana",
    "region": "West Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇬🇭",
    "accent_color": "#C9A227"
  },
  {
    "code": "SN",
    "name_ko": "세네갈",
    "name_en": "Senegal",
    "region": "West Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇸🇳",
    "accent_color": "#2E8A55"
  },
  {
    "code": "CI",
    "name_ko": "코트디부아르",
    "name_en": "Côte d'Ivoire",
    "region": "West Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇨🇮",
    "accent_color": "#D9822B"
  },
  {
    "code": "ML",
    "name_ko": "말리",
    "name_en": "Mali",
    "region": "West Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇲🇱",
    "accent_color": "#C9A227"
  },
  {
    "code": "KE",
    "name_ko": "케냐",
    "name_en": "Kenya",
    "region": "East Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇰🇪",
    "accent_color": "#3E7D45"
  },
  {
    "code": "TZ",
    "name_ko": "탄자니아",
    "name_en": "Tanzania",
    "region": "East Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇹🇿",
    "accent_color": "#2F8FB3"
  },
  {
    "code": "UG",
    "name_ko": "우간다",
    "name_en": "Uganda",
    "region": "East Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇺🇬",
    "accent_color": "#C9A227"
  },
  {
    "code": "RW",
    "name_ko": "르완다",
    "name_en": "Rwanda",
    "region": "East Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇷🇼",
    "accent_color": "#3A8FD5"
  },
  {
    "code": "ER",
    "name_ko": "에리트리아",
    "name_en": "Eritrea",
    "region": "Horn of Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇪🇷",
    "accent_color": "#3E8A4E"
  },
  {
    "code": "SO",
    "name_ko": "소말리아",
    "name_en": "Somalia",
    "region": "Horn of Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇸🇴",
    "accent_color": "#3A8FD5"
  },
  {
    "code": "CM",
    "name_ko": "카메룬",
    "name_en": "Cameroon",
    "region": "Central Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇨🇲",
    "accent_color": "#2E8A55"
  },
  {
    "code": "CD",
    "name_ko": "콩고민주공화국",
    "name_en": "DR Congo",
    "region": "Central Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇨🇩",
    "accent_color": "#3A8FD5"
  },
  {
    "code": "AO",
    "name_ko": "앙골라",
    "name_en": "Angola",
    "region": "Southern Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇦🇴",
    "accent_color": "#C8383A"
  },
  {
    "code": "MZ",
    "name_ko": "모잠비크",
    "name_en": "Mozambique",
    "region": "Southern Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇲🇿",
    "accent_color": "#2E7D45"
  },
  {
    "code": "ZW",
    "name_ko": "짐바브웨",
    "name_en": "Zimbabwe",
    "region": "Southern Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇿🇼",
    "accent_color": "#2E8A55"
  },
  {
    "code": "MG",
    "name_ko": "마다가스카르",
    "name_en": "Madagascar",
    "region": "Southern Africa",
    "continent_group": "mena_africa",
    "flag_emoji": "🇲🇬",
    "accent_color": "#2E8A55"
  },
  {
    "code": "CA",
    "name_ko": "캐나다",
    "name_en": "Canada",
    "region": "North America",
    "continent_group": "americas",
    "flag_emoji": "🇨🇦",
    "accent_color": "#C8383A"
  },
  {
    "code": "CU",
    "name_ko": "쿠바",
    "name_en": "Cuba",
    "region": "Caribbean",
    "continent_group": "americas",
    "flag_emoji": "🇨🇺",
    "accent_color": "#2F4F90"
  },
  {
    "code": "JM",
    "name_ko": "자메이카",
    "name_en": "Jamaica",
    "region": "Caribbean",
    "continent_group": "americas",
    "flag_emoji": "🇯🇲",
    "accent_color": "#2E8A55"
  },
  {
    "code": "DO",
    "name_ko": "도미니카공화국",
    "name_en": "Dominican Republic",
    "region": "Caribbean",
    "continent_group": "americas",
    "flag_emoji": "🇩🇴",
    "accent_color": "#2F4F90"
  },
  {
    "code": "HT",
    "name_ko": "아이티",
    "name_en": "Haiti",
    "region": "Caribbean",
    "continent_group": "americas",
    "flag_emoji": "🇭🇹",
    "accent_color": "#2F4F90"
  },
  {
    "code": "TT",
    "name_ko": "트리니다드 토바고",
    "name_en": "Trinidad and Tobago",
    "region": "Caribbean",
    "continent_group": "americas",
    "flag_emoji": "🇹🇹",
    "accent_color": "#C8383A"
  },
  {
    "code": "GT",
    "name_ko": "과테말라",
    "name_en": "Guatemala",
    "region": "Central America",
    "continent_group": "americas",
    "flag_emoji": "🇬🇹",
    "accent_color": "#3A8FD5"
  },
  {
    "code": "SV",
    "name_ko": "엘살바도르",
    "name_en": "El Salvador",
    "region": "Central America",
    "continent_group": "americas",
    "flag_emoji": "🇸🇻",
    "accent_color": "#2F5FA8"
  },
  {
    "code": "HN",
    "name_ko": "온두라스",
    "name_en": "Honduras",
    "region": "Central America",
    "continent_group": "americas",
    "flag_emoji": "🇭🇳",
    "accent_color": "#3A8FD5"
  },
  {
    "code": "NI",
    "name_ko": "니카라과",
    "name_en": "Nicaragua",
    "region": "Central America",
    "continent_group": "americas",
    "flag_emoji": "🇳🇮",
    "accent_color": "#2F5FA8"
  },
  {
    "code": "CR",
    "name_ko": "코스타리카",
    "name_en": "Costa Rica",
    "region": "Central America",
    "continent_group": "americas",
    "flag_emoji": "🇨🇷",
    "accent_color": "#2F4F90"
  },
  {
    "code": "PA",
    "name_ko": "파나마",
    "name_en": "Panama",
    "region": "Central America",
    "continent_group": "americas",
    "flag_emoji": "🇵🇦",
    "accent_color": "#2F4F90"
  },
  {
    "code": "CO",
    "name_ko": "콜롬비아",
    "name_en": "Colombia",
    "region": "South America",
    "continent_group": "americas",
    "flag_emoji": "🇨🇴",
    "accent_color": "#C9A227"
  },
  {
    "code": "VE",
    "name_ko": "베네수엘라",
    "name_en": "Venezuela",
    "region": "South America",
    "continent_group": "americas",
    "flag_emoji": "🇻🇪",
    "accent_color": "#C9A227"
  },
  {
    "code": "EC",
    "name_ko": "에콰도르",
    "name_en": "Ecuador",
    "region": "South America",
    "continent_group": "americas",
    "flag_emoji": "🇪🇨",
    "accent_color": "#C9A227"
  },
  {
    "code": "CL",
    "name_ko": "칠레",
    "name_en": "Chile",
    "region": "South America",
    "continent_group": "americas",
    "flag_emoji": "🇨🇱",
    "accent_color": "#2F4F90"
  },
  {
    "code": "UY",
    "name_ko": "우루과이",
    "name_en": "Uruguay",
    "region": "South America",
    "continent_group": "americas",
    "flag_emoji": "🇺🇾",
    "accent_color": "#3A8FD5"
  },
  {
    "code": "PY",
    "name_ko": "파라과이",
    "name_en": "Paraguay",
    "region": "South America",
    "continent_group": "americas",
    "flag_emoji": "🇵🇾",
    "accent_color": "#C8383A"
  },
  {
    "code": "AU",
    "name_ko": "호주",
    "name_en": "Australia",
    "region": "Oceania",
    "continent_group": "oceania",
    "flag_emoji": "🇦🇺",
    "accent_color": "#2F4F90"
  },
  {
    "code": "NZ",
    "name_ko": "뉴질랜드",
    "name_en": "New Zealand",
    "region": "Oceania",
    "continent_group": "oceania",
    "flag_emoji": "🇳🇿",
    "accent_color": "#2F3F7F"
  },
  {
    "code": "FJ",
    "name_ko": "피지",
    "name_en": "Fiji",
    "region": "Melanesia",
    "continent_group": "oceania",
    "flag_emoji": "🇫🇯",
    "accent_color": "#3A8FD5"
  },
  {
    "code": "PG",
    "name_ko": "파푸아뉴기니",
    "name_en": "Papua New Guinea",
    "region": "Melanesia",
    "continent_group": "oceania",
    "flag_emoji": "🇵🇬",
    "accent_color": "#C8383A"
  },
  {
    "code": "WS",
    "name_ko": "사모아",
    "name_en": "Samoa",
    "region": "Polynesia",
    "continent_group": "oceania",
    "flag_emoji": "🇼🇸",
    "accent_color": "#C8383A"
  },
  {
    "code": "TO",
    "name_ko": "통가",
    "name_en": "Tonga",
    "region": "Polynesia",
    "continent_group": "oceania",
    "flag_emoji": "🇹🇴",
    "accent_color": "#C8383A"
  }
];
