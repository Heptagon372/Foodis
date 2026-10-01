// ⚠️ UI 미리보기 전용 샘플 — 검수 전 문구다. DB 에 적재하지 않는다.
// 실제 콘텐츠는 foodis-data 파이프라인(근거 수집 → 초안 → 사람 검수)을 거친 것만 쓴다.
// 데모 필수 음식(dish_targets.csv demo_required=Y)과 관계 테마(만두 로드·커피 하우스·병아리콩·발효의 세계)에 맞춰 골랐다.
import type { DietKey, DietLevel } from "@/lib/foodi/schema";
import type { RelationType } from "@/lib/content/types";

type D = Partial<Record<DietKey, DietLevel>>;
export type PreviewFood = {
  n: number;
  slug: string;
  name_ko: string;
  name_en: string;
  name_local?: string;
  cc: string;
  summary: string;
  culture?: string;
  history?: string;
  tags: string[];
  method?: string;
  course?: string;
  ingredients: string[];
  diet: D;
  allergens?: string[];
  diet_note?: string;
  origin_note?: string;
};

export const previewId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const PREVIEW_FOODS: PreviewFood[] = [
  {
    n: 1, slug: "injera", name_ko: "인제라", name_en: "Injera", name_local: "እንጀራ", cc: "ET",
    summary: "테프 가루 반죽을 발효시켜 얇게 부친 시큼한 빵이에요. 위에 여러 요리를 올리고 손으로 찢어 싸 먹어요.",
    culture: "인제라는 접시이자 수저이자 음식이에요. 큰 쟁반에 인제라를 깔고 그 위에 여러 스튜를 올려 가족과 손님이 함께 둘러앉아 먹어요. 손으로 찢은 인제라에 스튜를 싸서 상대의 입에 넣어주는 인사도 있어요.",
    tags: ["sour", "fermented", "bread"], method: "fermented", course: "bread",
    ingredients: ["테프", "물"], diet: { vegan: "yes", vegetarian: "yes", halal: "yes", gluten_free: "depends", dairy_free: "yes" },
    diet_note: "테프만 쓰면 글루텐이 없지만, 밀가루를 섞는 식당도 있어요.", origin_note: "에리트레아와 공유하는 음식",
  },
  {
    n: 2, slug: "kimchi", name_ko: "김치", name_en: "Kimchi", name_local: "김치", cc: "KR",
    summary: "배추 같은 채소를 소금에 절여 고춧가루·마늘 양념과 함께 발효시킨 한국의 대표 반찬이에요.",
    history: "채소를 소금에 절여 오래 먹는 방식은 오래전부터 있었고, 고춧가루를 넣은 지금의 모습은 18세기 무렵 이후로 알려져 있어요. 정확한 시점은 자료마다 조금 달라요.",
    culture: "늦가을에 이웃과 가족이 모여 겨울 동안 먹을 김치를 한꺼번에 담그는 김장 문화가 있어요.",
    tags: ["spicy", "fermented", "vegetable"], method: "fermented", course: "side",
    ingredients: ["배추", "고춧가루", "마늘", "젓갈"], diet: { vegan: "depends", vegetarian: "depends", halal: "yes", gluten_free: "yes", dairy_free: "yes" },
    allergens: ["fish", "shellfish"], diet_note: "젓갈을 넣는 경우가 많아요. 비건 김치는 따로 확인하세요.",
  },
  {
    n: 3, slug: "mandu", name_ko: "만두", name_en: "Mandu", cc: "KR",
    summary: "밀가루 피에 고기·채소·두부 소를 넣어 찌거나 굽거나 끓여 먹는 한국식 만두예요.",
    tags: ["dumpling", "meat", "umami"], method: "steamed", course: "main",
    ingredients: ["밀가루", "돼지고기", "두부", "부추"], diet: { vegan: "depends", vegetarian: "depends", halal: "depends", gluten_free: "no", dairy_free: "yes" },
    allergens: ["wheat", "soy"],
  },
  {
    n: 4, slug: "jiaozi", name_ko: "자오쯔", name_en: "Jiaozi", name_local: "饺子", cc: "CN",
    summary: "얇은 밀가루 피에 소를 넣어 반달 모양으로 빚은 중국 만두예요. 물에 삶아 먹는 경우가 많아요.",
    culture: "중국 북방에서는 설 전날 밤 가족이 함께 자오쯔를 빚어 먹으며 새해를 맞는 풍습이 있어요.",
    tags: ["dumpling", "meat"], method: "boiled", course: "main",
    ingredients: ["밀가루", "돼지고기", "배추"], diet: { vegan: "depends", vegetarian: "depends", halal: "depends", gluten_free: "no", dairy_free: "yes" },
    allergens: ["wheat"],
  },
  {
    n: 5, slug: "momo", name_ko: "모모", name_en: "Momo", cc: "NP",
    summary: "히말라야 지역에서 즐겨 먹는 찐만두예요. 매콤한 토마토 소스를 곁들여 먹어요.",
    tags: ["dumpling", "spicy", "street_food"], method: "steamed", course: "street",
    ingredients: ["밀가루", "다진 고기", "양파", "향신료"], diet: { vegan: "depends", vegetarian: "depends", halal: "depends", gluten_free: "no", dairy_free: "yes" },
    allergens: ["wheat"], origin_note: "티베트 기원설",
  },
  {
    n: 6, slug: "manti", name_ko: "만티", name_en: "Manti", cc: "UZ",
    summary: "양고기와 양파를 넣어 크게 빚은 중앙아시아의 찐만두예요.",
    tags: ["dumpling", "meat"], method: "steamed", course: "main",
    ingredients: ["밀가루", "양고기", "양파"], diet: { vegan: "no", vegetarian: "no", halal: "depends", gluten_free: "no", dairy_free: "yes" },
    allergens: ["wheat"],
  },
  {
    n: 7, slug: "pierogi", name_ko: "피에로기", name_en: "Pierogi", cc: "PL",
    summary: "감자·치즈·양배추 등을 넣어 삶은 뒤 버터에 굽기도 하는 폴란드 만두예요.",
    tags: ["dumpling", "creamy"], method: "boiled", course: "main",
    ingredients: ["밀가루", "감자", "치즈", "양파"], diet: { vegan: "depends", vegetarian: "depends", halal: "depends", gluten_free: "no", dairy_free: "depends" },
    allergens: ["wheat", "dairy", "egg"],
  },
  {
    n: 8, slug: "khinkali", name_ko: "힌칼리", name_en: "Khinkali", cc: "GE",
    summary: "주름을 많이 잡아 빚은 조지아 만두예요. 안에 고인 육즙을 먼저 마시고 먹어요.",
    tags: ["dumpling", "meat", "soupy"], method: "boiled", course: "main",
    ingredients: ["밀가루", "다진 고기", "허브"], diet: { vegan: "depends", vegetarian: "depends", halal: "depends", gluten_free: "no", dairy_free: "yes" },
    allergens: ["wheat"],
  },
  {
    n: 9, slug: "falafel", name_ko: "팔라펠", name_en: "Falafel", cc: "LB",
    summary: "병아리콩이나 잠두를 갈아 허브와 함께 동그랗게 빚어 튀긴 중동 음식이에요.",
    tags: ["legume", "fried", "herbal", "street_food"], method: "fried", course: "street",
    ingredients: ["병아리콩", "파슬리", "마늘", "큐민"], diet: { vegan: "yes", vegetarian: "yes", halal: "yes", gluten_free: "depends", dairy_free: "yes" },
    origin_note: "이집트 기원설, 중동 전역", diet_note: "반죽에 밀가루를 섞거나 같은 기름에 다른 튀김을 하는 곳이 있어요.",
  },
  {
    n: 10, slug: "chana-masala", name_ko: "차나 마살라", name_en: "Chana masala", cc: "IN",
    summary: "병아리콩을 토마토·양파와 여러 향신료로 걸쭉하게 끓인 인도 북부 커리예요.",
    tags: ["legume", "spicy", "rich"], method: "stewed", course: "main",
    ingredients: ["병아리콩", "토마토", "양파", "가람 마살라"], diet: { vegan: "depends", vegetarian: "yes", halal: "yes", gluten_free: "yes", dairy_free: "depends" },
    diet_note: "버터 기름인 기를 쓰는 식당이 있어요.",
  },
  {
    n: 11, slug: "ceviche", name_ko: "세비체", name_en: "Ceviche", cc: "PE",
    summary: "날생선을 라임즙에 재워 양파·고추와 버무린 페루의 상큼한 해산물 요리예요.",
    tags: ["sour", "fresh", "seafood"], method: "raw", course: "main",
    ingredients: ["흰살생선", "라임", "적양파", "고추"], diet: { vegan: "no", vegetarian: "no", halal: "yes", gluten_free: "yes", dairy_free: "yes" },
    allergens: ["fish"], origin_note: "중남미 태평양 연안 공유",
  },
  {
    n: 12, slug: "turkish-coffee", name_ko: "튀르키예 커피", name_en: "Turkish coffee", cc: "TR",
    summary: "곱게 간 원두를 제즈베라는 작은 주전자에 물과 함께 끓여 가루째 따라 마시는 커피예요.",
    culture: "커피를 마신 뒤 잔에 남은 가루 모양으로 운세를 보는 놀이가 있고, 손님 접대의 중요한 의식이에요.",
    tags: ["rich"], method: "boiled", course: "drink",
    ingredients: ["커피 원두", "물", "설탕"], diet: { vegan: "yes", vegetarian: "yes", halal: "yes", gluten_free: "yes", dairy_free: "yes" },
  },
  {
    n: 13, slug: "viennese-coffee", name_ko: "비엔나 커피하우스 커피", name_en: "Viennese coffee", cc: "AT",
    summary: "빈의 커피하우스에서 물 한 잔과 함께 내오는 커피예요. 오래 머물며 신문을 읽는 문화로 유명해요.",
    culture: "빈의 커피하우스는 커피 한 잔을 시켜 두고 오래 머물며 신문을 읽고, 글을 쓰고, 대화를 나누는 곳이에요. 커피와 함께 물 한 잔이 나오는 것도 이곳의 오랜 습관이에요.",
    tags: ["creamy", "sweet"], method: "mixed", course: "drink",
    ingredients: ["커피", "우유", "휘핑크림"], diet: { vegan: "depends", vegetarian: "yes", halal: "yes", gluten_free: "yes", dairy_free: "depends" },
    allergens: ["dairy"],
  },
  {
    n: 14, slug: "saltena", name_ko: "살테냐", name_en: "Salteña", cc: "BO",
    summary: "달콤한 반죽 속에 국물 많은 고기 소를 넣어 구운 볼리비아의 아침 간식이에요.",
    tags: ["meat", "sweet", "street_food"], method: "baked", course: "street",
    ingredients: ["밀가루", "소고기", "감자", "완두콩"], diet: { vegan: "no", vegetarian: "no", halal: "depends", gluten_free: "no", dairy_free: "depends" },
    allergens: ["wheat", "egg"],
  },
  {
    n: 15, slug: "aloo-gobi", name_ko: "알루 고비", name_en: "Aloo gobi", cc: "IN",
    summary: "감자와 콜리플라워를 강황·큐민 같은 향신료로 볶아 만든 인도 채소 요리예요.",
    tags: ["vegetable", "spicy"], method: "stir_fried", course: "main",
    ingredients: ["감자", "콜리플라워", "강황", "큐민"], diet: { vegan: "depends", vegetarian: "yes", halal: "yes", gluten_free: "yes", dairy_free: "depends" },
    diet_note: "버터 기름인 기로 볶는 식당이 있어요.",
  },
  {
    n: 16, slug: "palak-paneer", name_ko: "팔락 파니르", name_en: "Palak paneer", cc: "IN",
    summary: "시금치 퓌레에 인도식 생치즈 파니르를 넣어 끓인 북인도 커리예요.",
    tags: ["creamy", "vegetable", "dairy"], method: "stewed", course: "main",
    ingredients: ["시금치", "파니르", "양파", "향신료"], diet: { vegan: "no", vegetarian: "yes", halal: "yes", gluten_free: "yes", dairy_free: "no" },
    allergens: ["dairy"],
  },
  {
    n: 17, slug: "butter-chicken", name_ko: "버터 치킨", name_en: "Butter chicken", cc: "IN",
    summary: "구운 닭고기를 토마토·버터·크림 소스에 넣어 부드럽게 끓인 인도 커리예요.",
    tags: ["creamy", "meat", "rich"], method: "stewed", course: "main",
    ingredients: ["닭고기", "토마토", "버터", "크림"], diet: { vegan: "no", vegetarian: "no", halal: "depends", gluten_free: "yes", dairy_free: "no" },
    allergens: ["dairy"],
  },
  {
    n: 18, slug: "satay", name_ko: "사테", name_en: "Satay", cc: "ID",
    summary: "양념한 고기를 꼬치에 꿰어 숯불에 굽고 땅콩 소스를 곁들이는 동남아시아 꼬치구이예요.",
    tags: ["grilled", "meat", "street_food", "nutty"], method: "grilled", course: "street",
    ingredients: ["닭고기", "땅콩 소스", "간장", "향신료"], diet: { vegan: "no", vegetarian: "no", halal: "depends", gluten_free: "depends", dairy_free: "yes" },
    allergens: ["peanut", "soy"], origin_note: "말레이시아·싱가포르 등과 공유",
  },
  {
    n: 19, slug: "lechon", name_ko: "레촌", name_en: "Lechon", cc: "PH",
    summary: "돼지 한 마리를 통째로 오래 구워 껍질을 바삭하게 만든 필리핀의 잔치 음식이에요.",
    tags: ["grilled", "meat", "crispy"], method: "grilled", course: "main",
    ingredients: ["돼지고기", "레몬그라스", "마늘"], diet: { vegan: "no", vegetarian: "no", halal: "no", gluten_free: "yes", dairy_free: "yes" },
    origin_note: "스페인어권과 공유",
  },
];

export const PREVIEW_RELATIONS: { from: string; to: string; type: RelationType; description: string }[] = [
  ...["jiaozi", "momo", "manti", "pierogi", "khinkali"].map((to) => ({
    from: "mandu", to, type: "historical_link" as const,
    description: "밀가루 피에 소를 싸서 익히는 만두 계열 — 유라시아 곳곳으로 퍼진 경로에는 여러 설이 있어요",
  })),
  { from: "jiaozi", to: "momo", type: "similar_taste", description: "얇은 피와 고기 소" },
  { from: "manti", to: "khinkali", type: "similar_taste", description: "큼직한 고기 만두" },
  { from: "turkish-coffee", to: "viennese-coffee", type: "historical_link", description: "오스만 제국과 빈의 커피하우스 문화 — 전래 이야기에는 여러 설이 있어요" },
  { from: "falafel", to: "chana-masala", type: "shares_ingredient", description: "병아리콩" },
  { from: "chana-masala", to: "aloo-gobi", type: "similar_taste", description: "향신료로 맛을 낸 북인도 채소 요리" },
  { from: "palak-paneer", to: "butter-chicken", type: "similar_taste", description: "크리미한 북인도 커리" },
  { from: "lechon", to: "satay", type: "same_technique", description: "불에 오래 구운 고기" },
  { from: "kimchi", to: "injera", type: "same_technique", description: "발효로 새콤한 맛을 내요" },
  { from: "ceviche", to: "kimchi", type: "similar_taste", description: "산뜻하고 새콤한 맛" },
];
