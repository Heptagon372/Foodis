// foodis-data/data/seed/countries.csv 에서 생성 (node 한 줄 스크립트). 시드가 바뀌면 다시 생성.
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
  }
];
