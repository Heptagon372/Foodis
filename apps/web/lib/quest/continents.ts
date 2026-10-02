// 퀘스트·배지용 나라 → 대륙 표. 홈·토스트처럼 나라 목록을 받지 않는 화면에서도 계산해야 해서
// PREVIEW_COUNTRIES(150개국 전체 JSON)를 클라이언트 번들에 넣지 않고 코드만 묶어 둔다. 시드가 바뀌면 quests.test.ts 가 잡는다.
const GROUPS: Record<string, string> = {
  asia: "KR JP CN TH VN ID PH IN NP UZ MN TW MY SG KH LA MM PK BD LK BT MV AF KZ KG TJ TM KP BN",
  europe: "IT FR ES GR AT PL GE AM AZ GB IE PT DE NL BE CH SE NO DK FI IS CZ SK HU RO BG UA RU LT LV EE RS HR BA AL CY MT SI MK ME MD BY LU",
  mena_africa: "TR LB IR EG MA ET ZA IL JO SA AE IQ SY YE OM TN DZ LY SD NG GH SN CI ML KE TZ UG RW ER SO CM CD AO MZ ZW MG KW QA BH BJ ZM MW MU CV",
  americas: "MX US PE BO BR AR CA CU JM DO HT TT GT SV HN NI CR PA CO VE EC CL UY PY BZ GY SR BB",
  oceania: "AU NZ FJ PG WS TO",
};

export const CONTINENT_KEYS = Object.keys(GROUPS);

export const CONTINENT_OF: Record<string, string> = Object.fromEntries(Object.entries(GROUPS).flatMap(([k, codes]) => codes.split(" ").map((c) => [c, k])));

/** 퀘스트 대상이 되는 나라 수 (콘텐츠에 있는 나라) */
export const COUNTRY_TOTAL = Object.keys(CONTINENT_OF).length;
