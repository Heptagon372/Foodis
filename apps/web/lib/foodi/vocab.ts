// 푸디가 알아듣는 말 (docs/design/19 §3). 1만 개 데이터의 통제 어휘(맛 29 · 조리법 16 · 코스 12)와
// 사람이 실제로 쓰는 한국어 표현을 잇는다. 질의 해석(query.ts) · LLM 슬롯 스키마(intent.ts) · 임베딩 문서(admin/rules.ts) 가 같은 표를 쓴다.

/** 1만 개 정리본의 맛·특징 태그 (tools/validate-food-import.mjs TASTE 와 같다) */
export const TASTE_TAGS = [
  "sour", "sweet", "salty", "bitter", "umami", "spicy", "fermented", "smoky", "nutty", "floral", "herbal", "rich", "light",
  "creamy", "crunchy", "chewy", "soft", "hot", "cold", "bread", "soup", "rice", "noodle", "meat", "seafood", "vegetable", "dairy", "egg", "fruit",
] as const;
export type TasteTag = (typeof TASTE_TAGS)[number];

export const METHODS = [
  "boiled", "steamed", "grilled", "fried", "deep_fried", "stir_fried", "roasted", "baked", "raw", "fermented", "pickled", "smoked", "braised", "stewed", "cured",
] as const;
export type Method = (typeof METHODS)[number];

export const COURSES = ["main", "side", "soup", "stew", "rice", "noodle", "bread", "dessert", "snack", "drink", "sauce", "breakfast"] as const;
export type Course = (typeof COURSES)[number];

/** 초기 280개(foodis-data common.py)의 옛 태그 → 새 어휘. 조리법·분류였던 것은 method/course 로 옮긴다 */
export const LEGACY_TAG: Record<string, { tag?: TasteTag; method?: Method; course?: Course }> = {
  soupy: { tag: "soup" },
  crispy: { tag: "crunchy" },
  fresh: { tag: "light" },
  grilled: { method: "grilled" },
  fried: { method: "fried" },
  street_food: { course: "snack" },
  legume: { tag: "vegetable" },
  dumpling: {},
};

export function normalizeTags(raw: readonly string[], method: string | null, course: string | null) {
  const tags = new Set<string>();
  let m = method;
  let c = course;
  for (const t of raw) {
    const legacy = LEGACY_TAG[t];
    if (!legacy) tags.add(t);
    else {
      if (legacy.tag) tags.add(legacy.tag);
      m ??= legacy.method ?? null;
      c ??= legacy.course ?? null;
    }
  }
  return { tags: [...tags], method: m, course: c };
}

export const TAG_KO: Record<string, string> = {
  sour: "새콤한", sweet: "달콤한", salty: "짭짤한", bitter: "쌉쌀한", umami: "감칠맛", spicy: "매운", fermented: "발효", smoky: "훈연향",
  nutty: "고소한", floral: "꽃향", herbal: "허브향", rich: "진한", light: "가벼운", creamy: "크리미한", crunchy: "바삭한", chewy: "쫄깃한",
  soft: "부드러운", hot: "따뜻한", cold: "차가운", bread: "빵", soup: "국물", rice: "밥", noodle: "면", meat: "고기", seafood: "해산물",
  vegetable: "채소", dairy: "유제품", egg: "달걀", fruit: "과일",
  // 옛 태그 (초기 280개)
  soupy: "국물", crispy: "바삭한", fresh: "산뜻한", grilled: "구운", fried: "튀긴", dumpling: "만두", legume: "콩", street_food: "길거리 음식",
};
export const METHOD_KO: Record<Method, string> = {
  boiled: "삶은", steamed: "찐", grilled: "구운", fried: "부친", deep_fried: "튀긴", stir_fried: "볶은", roasted: "통으로 구운", baked: "오븐에 구운",
  raw: "날것", fermented: "발효한", pickled: "절인", smoked: "훈제한", braised: "조린", stewed: "끓인", cured: "염장·건조한",
};
export const COURSE_KO: Record<Course, string> = {
  main: "주요리", side: "곁들이", soup: "수프·국", stew: "스튜·찌개", rice: "밥 요리", noodle: "면 요리", bread: "빵", dessert: "디저트",
  snack: "간식", drink: "음료", sauce: "소스", breakfast: "아침 식사",
};

// ── 질의 표현 → 어휘. 정규식은 '그 말이 나오면 그 뜻'인 것만. 애매한 한 글자(국·탕·밥)는 앞뒤를 본다
export const TASTE_WORDS: [RegExp, TasteTag][] = [
  [/매운|매콤|얼큰|칼칼|맵게|매워|화끈/, "spicy"],
  [/달콤|달달|단\s*(?:거|것|맛|음식|게)|단맛|달게/, "sweet"],
  [/새콤|상큼|시큼|신\s*맛|새큼/, "sour"],
  [/짭짤|짭조름|짠\s*(?:맛|거|음식)/, "salty"],
  [/쌉쌀|씁쓸|쓴\s*맛/, "bitter"],
  [/감칠맛/, "umami"],
  [/발효|삭힌|숙성/, "fermented"],
  [/훈제|훈연|불향|스모키/, "smoky"],
  [/고소/, "nutty"],
  [/꽃향|꽃잎|플로럴/, "floral"],
  [/허브|향긋/, "herbal"],
  [/진한|묵직|진득|기름진|헤비|녹진/, "rich"],
  [/가벼운|가볍게|담백|산뜻|깔끔한|라이트/, "light"],
  [/크리미|크림|꾸덕/, "creamy"],
  [/바삭|아삭|크런치|바스락/, "crunchy"],
  [/쫄깃|쫀득|쫀쫀/, "chewy"],
  [/부드러운|부드럽|말랑|촉촉|폭신/, "soft"],
  [/따뜻한|따뜻하게|뜨끈|뜨거운|따끈|따듯/, "hot"],
  [/시원한|시원하게|차가운|차갑게|찬\s*(?:거|것|음식|요리)|아이스/, "cold"],
  [/국물|수프|스프|(?<![설사])탕(?=$|[\s이을를은는도요])|(?:^|\s)국(?=$|[\s이을를물])/, "soup"],
  [/(?:^|\s)빵|베이커리|브레드/, "bread"],
  [/(?:^|\s)밥(?=$|[\s이을류요으])|쌀(?!국수)|덮밥|볶음밥|라이스/, "rice"],
  [/국수|누들|파스타|라면|우동|(?:^|\s)면(?=$|[\s이을요으])/, "noodle"],
  [/(?<!물)고기|육류|스테이크|바비큐|BBQ/i, "meat"],
  [/해산물|해물|씨푸드/, "seafood"],
  [/채소|야채|나물|샐러드/, "vegetable"],
  [/치즈|유제품|요거트|요구르트/, "dairy"],
  [/달걀|계란|에그/, "egg"],
  [/과일|열매|베리/, "fruit"],
];

/** 조리법 표현 → 하나 이상의 조리법 ("구운"은 그릴·오븐·통구이 어느 것이든) */
export const METHOD_WORDS: [RegExp, Method[]][] = [
  [/튀김|튀긴|튀겨|프라이드|후라이드/, ["deep_fried", "fried"]],
  [/볶음|볶은|볶아/, ["stir_fried"]],
  [/부침|지진|전\s*요리|팬에\s*부친/, ["fried"]],
  [/구운|구이|숯불|그릴|석쇠|꼬치|바비큐/, ["grilled", "roasted", "baked"]],
  [/오븐|베이크|베이킹|구운\s*과자/, ["baked"]],
  [/로스트|통구이/, ["roasted"]],
  [/찐|쪄|스팀|찜(?!닭)/, ["steamed", "braised"]],
  [/삶은|삶아|데친|수육/, ["boiled"]],
  [/조림|졸인|브레이즈/, ["braised"]],
  [/스튜|찌개|전골|푹\s*끓|끓인/, ["stewed"]],
  [/날것|날로|생으로|(?:^|\s)회(?=$|[\s를을가])|육회|타르타르|세비체/, ["raw"]],
  [/절인|절임|피클|장아찌|초절임/, ["pickled"]],
  [/훈제|훈연/, ["smoked"]],
  [/염장|말린|육포|건조/, ["cured"]],
  [/발효/, ["fermented"]],
];

export const COURSE_WORDS: [RegExp, Course[]][] = [
  [/디저트|후식|과자|케이크|스위츠|달달한\s*거|단\s*거/, ["dessert"]],
  [/간식|주전부리|길거리|분식|핑거\s*푸드|출출|야식/, ["snack"]],
  [/음료|마실\s*(?:거|것)|마시는|드링크|주스|커피|(?:^|\s)차(?=$|\s|를|\s*종류|\s*한\s*잔)|(?:^|\s)술(?=$|\s|을|이|종류)|칵테일|와인|맥주/, ["drink"]],
  [/아침|브런치|모닝/, ["breakfast"]],
  [/반찬|곁들|사이드|밑반찬|애피타이저|전채/, ["side"]],
  [/찌개|스튜|전골/, ["stew"]],
  [/수프|스프|국물\s*요리/, ["soup"]],
  [/면\s*요리|국수|누들|파스타/, ["noodle"]],
  [/밥\s*요리|덮밥|볶음밥|리소토|리조또|필라프|파에야/, ["rice"]],
  [/(?:^|\s)빵(?=$|[\s이을류])|베이커리/, ["bread"]],
  [/소스|양념장|드레싱|(?:^|\s)딥(?=$|\s)/, ["sauce"]],
  [/메인|주요리|한\s*끼|식사\s*(?:로|메뉴)/, ["main"]],
];

/** 상황 표현 → 부드러운 가산 (하드 필터 아님). "비 오는 날" 같은 말을 맛·코스 신호로 바꾼다 */
export const SITUATIONS: [RegExp, { tags?: TasteTag[]; courses?: Course[]; label: string }][] = [
  [/비\s*(?:오는|올\s*때|와서)|장마|으슬|추운|추워|겨울|쌀쌀|감기/, { tags: ["hot", "soup", "rich"], label: "따뜻한 국물" }],
  [/더운|더워|여름|무더|땀\s*나|후덥/, { tags: ["cold", "light"], label: "시원하고 가벼운" }],
  [/해장|숙취/, { tags: ["soup", "hot"], courses: ["soup", "stew"], label: "해장" }],
  [/안주|술\s*(?:이랑|과|한\s*잔|마실\s*때)/, { tags: ["salty"], courses: ["snack", "side"], label: "술안주" }],
  [/다이어트|칼로리\s*(?:낮|적)|건강한|건강식/, { tags: ["light", "vegetable"], label: "가벼운" }],
  [/배고파|배고픈|든든|푸짐|배부르/, { tags: ["rich"], courses: ["main"], label: "든든한" }],
  [/당\s*떨어|스트레스|기분\s*전환|우울/, { tags: ["sweet"], courses: ["dessert"], label: "달달한" }],
  [/야식|밤에|늦은\s*밤/, { courses: ["snack"], label: "야식" }],
  [/아침|브런치/, { courses: ["breakfast"], label: "아침" }],
];

/** 앞뒤에 이 말이 붙으면 '빼 달라'는 뜻 */
export const NEG_BEFORE = /(?:안|덜|노|무|논)\s*$/;
export const NEG_AFTER = /^[가-힣]{0,2}\s*(?:거|건|것|음식|요리)?\s*(?:말고|빼고|빼서|없는|없이|안\s*들어|안\s*들어간|싫|별로|못\s*먹|제외|않|아닌|알레르기|알러지|알르레기)/;
/** "땅콩 알레르기 있어" — 이 앞 낱말은 피해야 할 알레르기 */
export const ALLERGY_WORD = /([가-힣]+?)\s*(?:알레르기|알러지|알르레기)/g;
/** "맵지 않은" · "안 매운" · "순한" — 맛 표현이 활용형이라 위 규칙으로 못 잡는 부정 */
export const NEG_TASTE: [RegExp, TasteTag][] = [
  [/맵지\s*않|안\s*매운|안\s*맵|덜\s*매운|순한|매운\s*(?:거|건|것)?\s*(?:싫|말고|못\s*먹|빼고)/, "spicy"],
  [/달지\s*않|안\s*단|덜\s*단|단\s*(?:거|건|것)\s*(?:싫|말고|빼고)/, "sweet"],
  [/짜지\s*않|안\s*짠|덜\s*짠/, "salty"],
  [/느끼하지\s*않|안\s*느끼|기름지지\s*않/, "rich"],
];

/** 재료 개념: 말 → 재료 이름 패턴 (+ 대표 태그). 데이터의 재료 이름(6,856종)에 직접 없는 묶음말을 받는다 */
export const INGREDIENT_CONCEPTS: { re: RegExp; ing: RegExp; tag?: TasteTag; label: string }[] = [
  { re: /닭|치킨/, ing: /닭|chicken/i, label: "닭고기" },
  // 빼 달라는 쪽으로 자주 쓰이니 넓게 잡는다 (차슈·소시지처럼 이름에 '돼지'가 없는 돼지고기 가공품 포함)
  { re: /돼지|포크|삼겹/, ing: /돼지|베이컨|(?<!버)햄(?!버)|삼겹|라드|판체타|프로슈토|초리소|살라미|차슈|차샤오|족발|순대|소시지|소세지|pork|bacon|ham\b|lard|chorizo|salami|pancetta|prosciutto|char siu/i, label: "돼지고기" },
  { re: /소고기|쇠고기|비프|우육/, ing: /소고기|쇠고기|송아지|우족|beef|veal/i, label: "소고기" },
  { re: /양고기|머튼|램\s*(?:고기|요리)/, ing: /양고기|어린\s*양|머튼|염소고기|lamb|mutton|goat meat/i, label: "양고기" },
  { re: /생선/, ing: /생선|연어|대구|참치|고등어|청어|정어리|멸치|송어|틸라피아|메기|잉어|도미|숭어|가자미|넙치|fish|salmon|cod|tuna/i, tag: "seafood", label: "생선" },
  { re: /해산물|해물/, ing: /새우|게살|(?:^|\s)게(?:$|\s)|오징어|문어|조개|홍합|굴|가리비|랍스터|바닷가재|전복|낙지|shrimp|crab|squid|octopus|clam|mussel|oyster/i, tag: "seafood", label: "해산물" },
  { re: /(?<!물)고기|육류/, ing: /고기|베이컨|소시지|meat|bacon|sausage/i, tag: "meat", label: "고기" },
  { re: /두부/, ing: /두부|tofu/i, label: "두부" },
  { re: /버섯/, ing: /버섯|mushroom/i, label: "버섯" },
  { re: /(?:^|\s)콩(?=$|[\s이을으요])|콩류/, ing: /(?:^|\s)콩|대두|렌틸|병아리콩|강낭콩|녹두|팥|bean|lentil|chickpea/i, label: "콩" },
  { re: /치즈/, ing: /치즈|cheese/i, tag: "dairy", label: "치즈" },
];

/** 재료 이름으로는 쓰지만 질문에서 재료 뜻이 아닌 말 (데이터 재료 사전에서 뺀다) */
export const INGREDIENT_STOP = new Set([
  "물", "소금", "기름", "식용유", "반죽", "재료", "양념", "향신료", "소스", "허브", "채소", "고기", "과일", "견과", "빵", "밥", "음식", "요리", "가루",
  "설탕 시럽", "시럽", "육수", "국물", "토핑", "속", "껍질", "잎", "씨", "뿌리", "다진", "삶은", "말린", "구운", "튀긴", "생", "신선한", "얇게", "작은", "큰",
  "전통", "지역", "현지", "종류", "여러", "각종", "기타", "선택", "약간", "또는", "및", "그리고", "등",
]);

/** 일반 범주어: 데이터에 같은 이름의 음식이 있어도, 추천 질문에서는 '그런 종류'를 뜻한다 ("만두 추천해줘") */
export const CATEGORY_NOUNS = new Set([
  "만두", "국수", "라면", "피자", "볶음밥", "수프", "스튜", "케이크", "쿠키", "샐러드", "소시지", "카레", "커리", "파이", "푸딩", "치즈", "커피", "차", "와인", "맥주",
  "죽", "떡", "튀김", "꼬치", "빵", "샌드위치", "버거", "타코", "파스타", "밀크티", "칵테일", "아이스크림", "젤리", "사탕", "초콜릿", "도넛", "팬케이크", "와플", "김치",
]);
