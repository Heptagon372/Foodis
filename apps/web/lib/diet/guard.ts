// 식단 카테고리 경고 (docs/design/15). 사용자가 고른 종교·채식 단계·다이어트·건강 조건에 비춰 음식이 '위험(빨강)'·'주의(노랑)'인지 판정한다.
// 근거는 이미 검수된 값(식이 5종·알레르기)과 재료·이름·맛 태그 — AI 추측을 쓰지 않는 순수 규칙이라 같은 음식은 늘 같은 결과가 나온다.
// 원칙 (03 문서와 같다): 확실한 근거(재료·식이 no·알레르기)만 '위험', 조리법에 따라 다르거나 소개글에서만 보이면 '주의'. 모르면 경고하지 않는다(정보 부족 표시).
import type { Allergen, DietKey, DietLevel } from "@/lib/foodi/schema";

// ── 1. 재료 신호(flag)
export const FLAGS = [
  "pork", "beef", "lamb", "poultry", "meat", "unknown_meat", "organ", "blood", "processed_meat", "animal_flesh",
  "fish", "shellfish", "raw_fish", "raw_meat", "high_mercury",
  "egg", "dairy", "honey", "gelatin", "animal_product",
  "alcohol", "haram", "allium", "root", "wheat", "grain_carb", "sugar", "fried", "high_sodium", "high_purine",
  "legume", "caffeine", "spicy", "nuts", "peanut", "sesame", "soy",
] as const;
export type Flag = (typeof FLAGS)[number];

export const FLAG_LABEL: Record<Flag, string> = {
  pork: "돼지고기", beef: "소고기", lamb: "양·염소고기", poultry: "닭·오리고기", meat: "고기", unknown_meat: "어떤 고기인지 확인 필요", organ: "내장", blood: "선지·피",
  processed_meat: "가공육", animal_flesh: "고기·생선", fish: "생선", shellfish: "갑각류·조개", raw_fish: "날생선", raw_meat: "날고기",
  high_mercury: "수은 많은 생선", egg: "달걀", dairy: "유제품", honey: "꿀", gelatin: "젤라틴", animal_product: "동물성 재료",
  alcohol: "술", haram: "할랄 부적합 재료", allium: "오신채(마늘·파·양파·부추)", root: "뿌리채소", wheat: "밀·글루텐",
  grain_carb: "밥·면·빵", sugar: "당분", fried: "튀김", high_sodium: "짠 양념", high_purine: "퓨린 많은 재료",
  legume: "콩류", caffeine: "카페인", spicy: "매운맛", nuts: "견과류", peanut: "땅콩", sesame: "참깨", soy: "대두",
};

/** 상위 신호로 번진다: 돼지고기 → 고기 → 고기·생선 → 동물성 재료 */
const IMPLIES: Partial<Record<Flag, Flag[]>> = {
  pork: ["meat", "haram"], beef: ["meat"], lamb: ["meat"], poultry: ["meat"], organ: ["meat", "high_purine"], blood: ["meat", "haram"],
  processed_meat: ["meat"], raw_meat: ["meat"], meat: ["animal_flesh"], fish: ["animal_flesh"], shellfish: ["animal_flesh"],
  raw_fish: ["fish"], high_mercury: ["fish"], animal_flesh: ["animal_product"], egg: ["animal_product"], dairy: ["animal_product"],
  honey: ["animal_product", "sugar"], gelatin: ["animal_product"], alcohol: ["haram"],
};

type Strength = "yes" | "maybe";

/**
 * 키워드 사전. ko = 한국어 부분 일치(오인이 적은 단어만), koExact = 재료 이름이 정확히 같을 때만(짧아서 오인이 많은 단어),
 * en = 영어 단어 경계 일치. maybe = 이 단어만으로는 확실하지 않음(햄버거 → 보통 소고기).
 */
type Rule = { flags: Flag[]; ko?: string[]; koExact?: string[]; en?: string[]; maybe?: boolean };
const RULES: Rule[] = [
  { flags: ["pork"], ko: ["돼지", "삼겹살", "목살", "돈가스", "돈까스", "돈코츠", "제육", "보쌈", "족발", "라드", "베이컨", "하몽", "차슈", "레촌", "카르니타스", "판체타", "프로슈토", "초리소"], en: ["pork", "bacon", "ham", "lard", "prosciutto", "chorizo", "pancetta", "lechon", "lechón", "carnitas", "char siu", "chashu", "tonkatsu", "tonkotsu", "jamon", "jamón", "spam", "pepperoni", "porchetta", "cochinita"] },
  { flags: ["pork"], en: ["sausage", "schnitzel", "salami", "ramen", "dim sum", "bratwurst", "adobo"], ko: ["소시지", "라멘", "살라미"], maybe: true },
  { flags: ["beef"], ko: ["소고기", "쇠고기", "한우", "불고기", "차돌", "사골", "우둔", "양지", "스테이크", "육회", "햄버거"], en: ["beef", "steak", "bulgogi", "brisket", "veal", "oxtail", "wagyu", "pastrami", "corned", "bourguignon", "stroganoff", "hamburger", "yukhoe"] },
  { flags: ["beef"], ko: ["갈비", "쌀국수", "렌당", "굴라시"], en: ["pho", "phở", "burger", "rendang", "goulash", "galbi", "kalbi", "carpaccio", "meatball", "chili con carne", "lasagna", "lasagne", "bolognese", "taco"], maybe: true },
  { flags: ["lamb"], ko: ["양고기", "염소", "머튼", "양갈비"], en: ["lamb", "mutton", "goat", "haggis"] },
  { flags: ["lamb"], ko: ["케밥", "기로스", "타진"], en: ["kebab", "gyro", "gyros", "tagine", "shawarma", "biryani", "moussaka"], maybe: true },
  { flags: ["poultry"], ko: ["닭", "치킨", "오리고기", "칠면조", "메추리"], koExact: ["오리"], en: ["chicken", "duck", "turkey", "poultry", "goose", "quail", "pollo"] },
  { flags: ["poultry"], en: ["tikka", "tandoori"], maybe: true },
  { flags: ["meat"], ko: ["고기", "육포", "미트"], en: ["meat", "jerky"] },
  { flags: ["meat"], ko: ["육수", "만두"], en: ["broth", "stock", "dumpling"], maybe: true },
  { flags: ["organ"], ko: ["내장", "곱창", "막창", "대창", "천엽", "순대", "푸아그라"], koExact: ["간", "양"], en: ["liver", "tripe", "kidney", "offal", "intestine", "giblet", "foie gras", "haggis", "menudo", "sweetbread"] },
  { flags: ["blood"], ko: ["선지", "순대"], en: ["blood", "black pudding", "morcilla", "dinuguan"] },
  { flags: ["processed_meat"], koExact: ["햄"], ko: ["소시지", "베이컨", "살라미", "스팸", "하몽"], en: ["sausage", "ham", "bacon", "salami", "hot dog", "pepperoni", "prosciutto", "bratwurst", "chorizo", "spam"] },
  { flags: ["fish"], ko: ["생선", "연어", "참치", "고등어", "멸치", "대구", "명태", "황태", "가다랑어", "가쓰오", "정어리", "청어", "장어", "어묵", "피시소스", "액젓", "숭어", "꽁치", "갈치", "광어", "도미"], en: ["fish", "salmon", "tuna", "cod", "anchovy", "anchovies", "sardine", "herring", "mackerel", "eel", "fish sauce", "bonito", "trout", "tilapia", "catfish", "snapper", "bacalhau", "bacalao", "nam pla"] },
  { flags: ["fish"], ko: ["젓갈"], koExact: ["다시"], en: ["dashi", "pad thai", "som tam"], maybe: true },
  { flags: ["shellfish"], ko: ["새우", "꽃게", "대게", "게장", "랍스터", "가재", "조개", "홍합", "전복", "오징어", "문어", "낙지", "가리비", "꼬막", "바지락", "굴전", "굴국밥"], koExact: ["게", "굴"], en: ["shrimp", "prawn", "crab", "lobster", "crayfish", "clam", "oyster", "mussel", "scallop", "squid", "octopus", "calamari", "abalone", "shellfish", "paella", "jambalaya"] },
  { flags: ["shellfish", "fish"], ko: ["해산물", "해물"], en: ["seafood"], maybe: true },
  { flags: ["shellfish"], ko: ["젓갈", "똠얌"], en: ["tom yum"], maybe: true },
  { flags: ["raw_fish"], ko: ["사시미", "스시", "초밥", "포케", "세비체", "물회", "생선회", "날생선"], en: ["sushi", "sashimi", "poke", "ceviche", "crudo", "gravlax", "raw fish", "kinilaw"] },
  { flags: ["raw_meat"], ko: ["육회", "타르타르"], en: ["tartare", "yukhoe", "kibbeh nayyeh", "mett", "carpaccio"] },
  { flags: ["high_mercury"], ko: ["상어", "황새치", "청새치"], en: ["shark", "swordfish", "marlin", "king mackerel", "tilefish"] },
  { flags: ["high_mercury"], ko: ["참치"], en: ["tuna"], maybe: true },
  { flags: ["egg"], ko: ["달걀", "계란", "메추리알", "노른자", "마요네즈", "오믈렛"], en: ["egg", "eggs", "omelet", "omelette", "mayonnaise", "meringue", "frittata", "quiche", "carbonara", "custard", "shakshuka"] },
  { flags: ["dairy"], ko: ["우유", "치즈", "버터", "크림", "요거트", "요구르트", "파니르", "연유", "라씨", "라떼", "모차렐라"], koExact: ["기"], en: ["milk", "cheese", "butter", "cream", "yogurt", "yoghurt", "ghee", "paneer", "lassi", "mozzarella", "parmesan", "feta", "ricotta", "custard", "gelato", "ice cream", "béchamel", "bechamel", "latte", "halloumi", "burrata", "fondue", "raclette", "tzatziki"] },
  { flags: ["honey"], ko: ["꿀"], en: ["honey", "baklava"] },
  { flags: ["gelatin"], ko: ["젤라틴", "젤리", "마시멜로"], en: ["gelatin", "gelatine", "jelly", "aspic", "marshmallow", "panna cotta"] },
  { flags: ["alcohol"], ko: ["맥주", "와인", "소주", "막걸리", "청주", "사케", "미림", "브랜디", "위스키", "보드카", "데킬라", "럼주", "술빵", "포도주", "고량주"], koExact: ["술", "럼"], en: ["beer", "wine", "sake", "mirin", "rum", "brandy", "whisky", "whiskey", "vodka", "tequila", "liqueur", "cognac", "sherry", "coq au vin", "sangria", "ale", "stout", "flambé"] },
  { flags: ["alcohol"], ko: ["티라미수"], en: ["tiramisu", "rum baba", "black forest"], maybe: true },
  { flags: ["allium"], ko: ["마늘", "양파", "대파", "쪽파", "부추", "달래", "샬롯", "리크", "차이브", "아위", "골파"], koExact: ["파"], en: ["garlic", "onion", "leek", "chive", "chives", "scallion", "shallot", "asafoetida", "hing"] },
  { flags: ["root"], ko: ["감자", "당근", "고구마", "비트", "생강", "연근", "우엉", "토란", "카사바", "순무", "마늘", "양파"], koExact: ["무", "얌"], en: ["potato", "carrot", "radish", "beet", "beetroot", "ginger", "cassava", "yam", "turnip", "taro", "garlic", "onion", "yuca"] },
  { flags: ["wheat"], ko: ["밀가루", "통밀", "파스타", "쿠스쿠스", "보리", "호밀", "만두피", "피자", "또띠아", "빵"], koExact: ["밀", "난"], en: ["wheat", "flour", "bread", "pasta", "couscous", "barley", "rye", "bulgur", "seitan", "semolina", "pastry", "pizza", "naan", "pita", "spaghetti", "croissant", "baguette", "bun", "udon"] },
  { flags: ["wheat"], ko: ["간장", "튀김옷", "국수", "라면", "만두"], en: ["soy sauce", "noodle", "noodles", "dumpling", "tempura", "ramen", "beer"], maybe: true },
  { flags: ["grain_carb"], ko: ["쌀", "밥", "밀가루", "국수", "빵", "떡", "옥수수", "또띠아", "파스타", "쿠스쿠스", "라면", "냉면", "우동", "흰죽"], koExact: ["죽"], en: ["rice", "noodle", "noodles", "bread", "pasta", "couscous", "tortilla", "flour", "pizza", "dumpling", "cake", "porridge", "polenta", "naan", "pilaf", "risotto", "biryani", "fried rice", "bun"] },
  { flags: ["grain_carb"], ko: ["감자", "고구마"], en: ["potato", "potatoes"], maybe: true },
  { flags: ["sugar"], ko: ["설탕", "시럽", "초콜릿", "연유", "잼", "케이크", "아이스크림", "사탕", "디저트", "꿀", "조청", "호떡", "약과"], en: ["sugar", "syrup", "chocolate", "cake", "candy", "dessert", "pastry", "ice cream", "honey", "caramel", "toffee", "fudge", "cookie", "brownie", "pudding", "baklava", "churro", "donut", "doughnut", "mochi", "halwa", "gulab jamun", "flan", "tart"] },
  { flags: ["fried"], ko: ["튀김", "튀긴", "프라이", "돈가스", "돈까스", "치킨", "츄러스", "도넛", "가라아게", "고로케"], en: ["fried", "fritter", "tempura", "katsu", "karaage", "chips", "fries", "doughnut", "donut", "churro", "pakora", "samosa", "falafel", "croquette", "schnitzel", "fish and chips", "spring roll", "empanada", "chimichanga"] },
  { flags: ["high_sodium"], ko: ["간장", "된장", "고추장", "젓갈", "액젓", "장아찌", "피시소스", "소금에 절", "염장", "짠지", "쌈장", "미소시루", "미소라멘"], koExact: ["미소"], en: ["soy sauce", "miso", "fish sauce", "cured", "pickled", "salted", "anchovy", "anchovies", "prosciutto", "salami", "bacon", "ham", "kimchi", "ramen", "nam pla"] },
  { flags: ["high_purine"], ko: ["멸치", "정어리", "고등어", "청어", "가리비", "홍합", "맥주", "곱창", "내장", "사골"], koExact: ["간"], en: ["anchovy", "anchovies", "sardine", "herring", "mackerel", "scallop", "mussel", "liver", "kidney", "offal", "tripe", "beer", "broth"] },
  { flags: ["legume"], ko: ["콩국", "콩가루", "강낭콩", "검은콩", "대두", "두부", "렌틸", "병아리콩", "팥", "녹두", "후무스", "팔라펠", "에다마메"], koExact: ["콩", "달"], en: ["bean", "beans", "lentil", "lentils", "chickpea", "chickpeas", "tofu", "dal", "dhal", "hummus", "falafel", "edamame", "tempeh", "natto", "chana", "feijoada"] },
  { flags: ["caffeine"], ko: ["커피", "녹차", "홍차", "말차", "에스프레소", "초콜릿", "카카오", "짜이", "밀크티"], en: ["coffee", "espresso", "green tea", "black tea", "matcha", "chocolate", "cocoa", "chai", "cappuccino", "latte", "tiramisu"] },
  // 보리차·옥수수차·허브차처럼 카페인 없는 차도 많아서 '차'만으로는 주의까지
  { flags: ["caffeine"], koExact: ["차"], en: ["tea"], maybe: true },
  { flags: ["spicy"], ko: ["고추", "고춧가루", "칠리", "할라피뇨", "마라", "매운", "불닭", "청양"], en: ["chili", "chilli", "chile", "jalapeño", "jalapeno", "spicy", "sichuan", "mala", "vindaloo", "harissa", "sriracha", "habanero", "piri piri", "peri peri"] },
  { flags: ["spicy"], en: ["curry"], ko: ["커리", "카레", "김치"], maybe: true },
  { flags: ["nuts"], ko: ["견과", "호두", "아몬드", "캐슈", "피스타치오", "잣", "헤이즐넛"], en: ["nut", "nuts", "walnut", "almond", "cashew", "pistachio", "hazelnut", "pecan", "pine nut", "baklava", "pesto"] },
  { flags: ["peanut"], ko: ["땅콩"], en: ["peanut", "peanuts", "satay", "sate", "pad thai", "gado-gado"] },
  { flags: ["sesame"], ko: ["참깨", "참기름", "깨소금", "타히니"], koExact: ["깨"], en: ["sesame", "tahini", "hummus", "halva"] },
  { flags: ["soy"], ko: ["대두", "두부", "간장", "된장", "미소시루", "낫토", "템페"], koExact: ["미소"], en: ["soy", "tofu", "miso", "natto", "tempeh", "edamame", "soy sauce"] },
];

// 맛 태그(taste_tags) → 신호. meat·seafood 태그는 사람이 붙인 분류라 확실, 조리 형태(국물·발효)는 약한 신호
const TAG_FLAGS: Record<string, [Flag, Strength][]> = {
  meat: [["meat", "yes"]],
  seafood: [["animal_flesh", "yes"], ["fish", "maybe"], ["shellfish", "maybe"]],
  dairy: [["dairy", "yes"]],
  creamy: [["dairy", "maybe"]],
  fried: [["fried", "yes"]],
  crispy: [["fried", "maybe"]],
  rice: [["grain_carb", "yes"]],
  noodle: [["grain_carb", "yes"], ["wheat", "maybe"]],
  bread: [["grain_carb", "yes"], ["wheat", "maybe"]],
  dumpling: [["grain_carb", "yes"], ["wheat", "maybe"], ["meat", "maybe"]],
  sweet: [["sugar", "yes"]],
  salty: [["high_sodium", "yes"]],
  fermented: [["high_sodium", "maybe"]],
  soupy: [["high_sodium", "maybe"]],
  spicy: [["spicy", "yes"]],
  legume: [["legume", "yes"]],
};

const ALLERGEN_FLAG: Record<string, Flag> = { nuts: "nuts", peanut: "peanut", shellfish: "shellfish", fish: "fish", egg: "egg", soy: "soy", wheat: "wheat", dairy: "dairy", sesame: "sesame" };

export type GuardFood = {
  name_ko: string;
  name_en?: string | null;
  summary?: string | null;
  taste_tags?: string[];
  diet?: Partial<Record<DietKey, DietLevel>>;
  allergens?: string[];
  /** 재료 이름 (한국어). 상세·미리보기 음식에만 있다 */
  ingredients?: string[];
};

export type FlagMap = Partial<Record<Flag, Strength>>;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const enRe = new Map<string, RegExp>();
const wordRe = (w: string) => {
  let re = enRe.get(w);
  if (!re) enRe.set(w, (re = new RegExp(`(^|[^\\p{L}])${escapeRe(w)}($|[^\\p{L}])`, "iu")));
  return re;
};

/** '물고기'의 '고기'처럼 다른 뜻으로 겹치는 말을 먼저 바꿔 둔다 */
const norm = (t: string) => t.replace(/물고기/g, "생선");

/** 음식 한 개 → 재료 신호. 근거가 겹치면 강한 쪽(yes)이 이긴다 */
export function flagsOf(food: GuardFood): FlagMap {
  const out: FlagMap = {};
  const put = (f: Flag, s: Strength) => {
    if (out[f] === "yes") return;
    out[f] = s;
    for (const g of IMPLIES[f] ?? []) put(g, s);
  };

  // ① 검수된 식이 값
  const d = food.diet ?? {};
  if (d.vegetarian === "no") put("animal_flesh", "yes");
  else if (d.vegetarian === "depends") put("animal_flesh", "maybe");
  if (d.vegan === "no") put("animal_product", "yes");
  else if (d.vegan === "depends") put("animal_product", "maybe");
  if (d.halal === "no") put("haram", "yes");
  if (d.gluten_free === "no") put("wheat", "yes");
  else if (d.gluten_free === "depends") put("wheat", "maybe");
  if (d.dairy_free === "no") put("dairy", "yes");
  else if (d.dairy_free === "depends") put("dairy", "maybe");

  // ② 알레르기 (검수된 값 → 확실)
  for (const a of food.allergens ?? []) if (ALLERGEN_FLAG[a]) put(ALLERGEN_FLAG[a], "yes");

  // ③ 맛 태그
  for (const t of food.taste_tags ?? []) for (const [f, s] of TAG_FLAGS[t] ?? []) put(f, s);

  // ④ 재료 · 이름 (확실) / 소개글 (약하게 — "고기 대신 두부" 같은 문장을 위험으로 단정하지 않으려고)
  const ingredients = (food.ingredients ?? []).map((x) => x.trim());
  const ingText = ingredients.join(" ");
  const strong = norm(`${food.name_ko} ${ingText}`);
  const nameEn = food.name_en ?? "";
  const summary = norm(food.summary ?? "");
  for (const r of RULES) {
    const hit = (txt: string, en: string, exact: string[]) =>
      (r.ko ?? []).some((k) => txt.includes(k)) || (r.en ?? []).some((w) => wordRe(w).test(en)) || (r.koExact ?? []).some((k) => exact.includes(k));
    const s: Strength | null = hit(strong, `${nameEn} ${ingText}`, ingredients) ? (r.maybe ? "maybe" : "yes") : hit(summary, summary, []) ? "maybe" : null;
    if (s) for (const f of r.flags) put(f, s);
  }
  // 고기 종류가 확실하면 이름만 보고 짐작한 다른 종류는 지운다 (닭갈비의 '갈비' → 소고기 X)
  const SPECIES = ["pork", "beef", "lamb", "poultry"] as const;
  if (SPECIES.some((f) => out[f] === "yes")) for (const f of SPECIES) if (out[f] === "maybe") delete out[f];
  // 고기인데 종류를 모르면 따로 표시 — 힌두교·폴로처럼 '어떤 고기냐'가 중요한 조건이 쓴다
  if (out.meat && !SPECIES.some((f) => out[f])) out.unknown_meat = out.meat;
  return out;
}

// ── 2. 식단 카테고리
export type GuardGroup = "faith" | "veg" | "diet" | "health" | "etc";
export const GROUP_LABEL: Record<GuardGroup, string> = { faith: "종교 · 신념", veg: "채식 단계", diet: "다이어트", health: "건강 · 질환", etc: "기타" };

type Category = {
  group: GuardGroup;
  label: string;
  hint: string;
  /** 위험(빨강): 이 재료가 확실하면 먹으면 안 된다 */
  danger: Flag[];
  /** 주의(노랑): 확인이 필요하다 (위험 재료가 '아마도'일 때도 주의) */
  caution?: Flag[];
  /** 기존 추천 필터(DietKey)와 같은 조건 — 고르면 추천에서도 빠진다 */
  diet?: DietKey;
};

export const GUARD_CATEGORIES = {
  // 종교 · 신념
  halal: { group: "faith", label: "할랄 (이슬람)", hint: "돼지고기·술·피 금지, 고기는 도축 방식 확인", danger: ["pork", "alcohol", "blood", "haram"], caution: ["meat", "gelatin"], diet: "halal" },
  kosher: { group: "faith", label: "코셔 (유대교)", hint: "돼지고기·갑각류 금지, 고기+유제품 함께 금지", danger: ["pork", "shellfish", "blood"], caution: ["meat", "gelatin", "alcohol"] },
  hindu: { group: "faith", label: "힌두교", hint: "소고기 금지, 채식을 하는 사람도 많아요", danger: ["beef"], caution: ["unknown_meat", "gelatin"] },
  jain: { group: "faith", label: "자이나교", hint: "고기·생선·달걀·꿀 금지, 뿌리채소도 먹지 않아요", danger: ["animal_flesh", "egg", "honey", "gelatin", "root", "alcohol"], caution: ["animal_product"] },
  buddhist: { group: "faith", label: "불교 사찰식", hint: "고기·생선과 오신채(마늘·파·양파·부추) 없이", danger: ["animal_flesh", "allium", "alcohol"], caution: ["egg", "gelatin"] },
  // 채식 단계 (엄격한 순)
  vegan: { group: "veg", label: "비건", hint: "고기·생선·달걀·유제품·꿀 모두 없이", danger: ["animal_product"], diet: "vegan" },
  lacto: { group: "veg", label: "락토 베지테리언", hint: "유제품만 OK (달걀 X)", danger: ["animal_flesh", "egg", "gelatin"] },
  ovo: { group: "veg", label: "오보 베지테리언", hint: "달걀만 OK (유제품 X)", danger: ["animal_flesh", "dairy", "gelatin"] },
  lacto_ovo: { group: "veg", label: "락토-오보 (채식)", hint: "달걀·유제품 OK, 고기·생선 X", danger: ["animal_flesh", "gelatin"], diet: "vegetarian" },
  pescatarian: { group: "veg", label: "페스코", hint: "생선·해산물까지 OK, 고기 X", danger: ["meat", "gelatin"], caution: ["animal_flesh"] },
  pollotarian: { group: "veg", label: "폴로", hint: "닭·오리·생선까지 OK, 붉은 고기 X", danger: ["pork", "beef", "lamb"], caution: ["unknown_meat"] },
  flexitarian: { group: "veg", label: "플렉시테리언", hint: "주로 채식, 가끔 고기 — 붉은 고기만 살짝 알려줘요", danger: [], caution: ["pork", "beef", "lamb", "processed_meat"] },
  // 다이어트
  keto: { group: "diet", label: "키토 · 저탄고지", hint: "밥·면·빵·당분을 크게 줄여요", danger: ["grain_carb", "sugar"], caution: ["root", "legume"] },
  low_cal: { group: "diet", label: "체중 감량 · 저칼로리", hint: "튀김·당분을 줄여요", danger: ["fried"], caution: ["sugar", "grain_carb", "processed_meat"] },
  paleo: { group: "diet", label: "팔레오", hint: "곡물·콩·유제품·설탕 없이", danger: ["grain_carb", "legume", "dairy", "sugar"], caution: ["processed_meat"] },
  high_protein: { group: "diet", label: "고단백", hint: "탄수화물 위주 음식을 알려줘요", danger: [], caution: ["sugar", "fried"] },
  // 건강 · 질환
  celiac: { group: "health", label: "글루텐 프리 · 셀리악", hint: "밀·보리·호밀 없이", danger: ["wheat"], diet: "gluten_free" },
  lactose: { group: "health", label: "유당불내증 · 유제품 X", hint: "우유·치즈·버터 없이", danger: ["dairy"], diet: "dairy_free" },
  diabetes: { group: "health", label: "당뇨 · 혈당 관리", hint: "당분은 피하고 밥·면·빵은 양 조절", danger: ["sugar"], caution: ["grain_carb", "fried"] },
  low_sodium: { group: "health", label: "고혈압 · 저염식", hint: "짠 양념·젓갈·가공육을 줄여요", danger: ["high_sodium", "processed_meat"] },
  gout: { group: "health", label: "통풍", hint: "내장·멸치·맥주처럼 퓨린 많은 음식 주의", danger: ["high_purine", "alcohol"], caution: ["shellfish", "fish", "meat"] },
  fodmap: { group: "health", label: "과민성 장 · 저포드맵", hint: "마늘·양파·밀·콩 주의", danger: ["allium"], caution: ["wheat", "legume", "dairy"] },
  pregnancy: { group: "health", label: "임신 · 수유 중", hint: "날생선·날고기·술·수은 많은 생선 X", danger: ["raw_fish", "raw_meat", "alcohol", "high_mercury"], caution: ["processed_meat", "caffeine"] },
  stomach: { group: "health", label: "위장 보호 · 매운맛 X", hint: "매운 음식·튀김을 알려줘요", danger: ["spicy"], caution: ["fried", "caffeine", "alcohol"] },
  // 기타
  no_alcohol: { group: "etc", label: "술 X", hint: "술로 조리·숙성한 음식도 알려줘요", danger: ["alcohol"] },
  no_caffeine: { group: "etc", label: "카페인 X", hint: "커피·차·초콜릿", danger: ["caffeine"] },
  no_raw: { group: "etc", label: "날것 X", hint: "회·육회처럼 익히지 않은 음식", danger: ["raw_fish", "raw_meat"] },
  no_pork: { group: "etc", label: "돼지고기 X", hint: "종교와 상관없이 안 먹을 때", danger: ["pork"], caution: ["unknown_meat"] },
  no_beef: { group: "etc", label: "소고기 X", hint: "종교와 상관없이 안 먹을 때", danger: ["beef"], caution: ["unknown_meat"] },
} satisfies Record<string, Category>;

export type GuardKey = keyof typeof GUARD_CATEGORIES;
export const GUARD_KEYS = Object.keys(GUARD_CATEGORIES) as GuardKey[];
const CAT: Record<GuardKey, Category> = GUARD_CATEGORIES;
export const categoryOf = (k: GuardKey): Category => CAT[k];

/** 기존 추천 필터 값 ↔ 카테고리 */
export const GUARD_OF_DIET = Object.fromEntries(GUARD_KEYS.filter((k) => CAT[k].diet).map((k) => [CAT[k].diet, k])) as Record<DietKey, GuardKey>;

/** 저장된 선택 = 추천 필터(diet) + 카테고리(guards). 둘을 합쳐 하나의 카테고리 목록으로 본다 */
export const selectedGuards = (diet: readonly DietKey[], guards: readonly string[] = []): GuardKey[] =>
  [...new Set([...diet.map((d) => GUARD_OF_DIET[d]), ...guards.filter((g): g is GuardKey => g in CAT)])];

// ── 3. 판정
export type GuardLevel = "danger" | "caution";
export type GuardHit = { key: string; label: string; level: GuardLevel; reasons: Flag[] };
export type GuardResult = {
  /** 가장 심한 단계. 고른 조건이 없으면 null */
  level: GuardLevel | "clear" | "unknown" | null;
  hits: GuardHit[];
};

/** 이유에서 상위 신호는 하위가 있으면 뺀다 (돼지고기가 있으면 '고기'는 굳이 말하지 않는다) */
const prune = (fs: Flag[]) => fs.filter((f) => !fs.some((g) => g !== f && closure(g).has(f)));
const closureCache = new Map<Flag, Set<Flag>>();
function closure(f: Flag): Set<Flag> {
  let s = closureCache.get(f);
  if (!s) {
    s = new Set<Flag>();
    const walk = (x: Flag) => (IMPLIES[x] ?? []).forEach((y) => (s!.has(y) ? null : (s!.add(y), walk(y))));
    walk(f);
    closureCache.set(f, s);
  }
  return s;
}

/** 이유는 가장 구체적인 재료로: 불교 사찰식의 '고기·생선' → 실제로 든 '돼지고기' */
const specific = (fs: Flag[], flags: FlagMap) =>
  prune([...new Set(fs.flatMap((f) => {
    const from = (Object.keys(flags) as Flag[]).filter((g) => flags[g] === flags[f] && closure(g).has(f));
    return from.length ? from : [f];
  }))]);

export function judgeCategory(key: GuardKey, flags: FlagMap): GuardHit | null {
  const c = CAT[key];
  const danger = c.danger.filter((f) => flags[f] === "yes");
  // 코셔: 고기와 유제품을 한 음식에 같이 쓰지 않는다
  if (key === "kosher" && flags.meat === "yes" && flags.dairy === "yes") danger.push("meat", "dairy");
  if (danger.length) return { key, label: c.label, level: "danger", reasons: specific(danger, flags) };
  const caution = [...c.danger.filter((f) => flags[f] === "maybe"), ...(c.caution ?? []).filter((f) => flags[f])];
  if (key === "kosher" && flags.meat && flags.dairy) caution.push("dairy");
  if (caution.length) return { key, label: c.label, level: "caution", reasons: specific(caution, flags) };
  return null;
}

/** 음식에 대한 근거가 충분한가 — 없으면 '경고 없음'을 '안전'으로 착각하지 않게 '정보 부족'으로 말한다 */
export const hasEvidence = (food: GuardFood) =>
  (food.ingredients?.length ?? 0) > 0 || Object.values(food.diet ?? {}).some((v) => v && v !== "unknown") || (food.allergens?.length ?? 0) > 0;

export function assess(food: GuardFood, sel: { guards: readonly GuardKey[]; allergens?: readonly (Allergen | string)[] }): GuardResult {
  if (!sel.guards.length && !sel.allergens?.length) return { level: null, hits: [] };
  const flags = flagsOf(food);
  const hits: GuardHit[] = [];
  for (const a of sel.allergens ?? []) {
    const f = ALLERGEN_FLAG[a];
    // 확실한 근거는 위험, 소개글에서만 보이면 주의 (문장 속 우연한 단어로 빨강을 띄우지 않게)
    if (f && flags[f]) hits.push({ key: `allergen:${a}`, label: `알레르기 · ${FLAG_LABEL[f]}`, level: flags[f] === "yes" ? "danger" : "caution", reasons: [f] });
  }
  for (const k of sel.guards) {
    const h = judgeCategory(k, flags);
    if (h) hits.push(h);
  }
  hits.sort((a, b) => (a.level === b.level ? 0 : a.level === "danger" ? -1 : 1));
  const level = hits.some((h) => h.level === "danger") ? "danger" : hits.length ? "caution" : hasEvidence(food) ? "clear" : "unknown";
  return { level, hits };
}

/** 카드에 쓰는 한 줄 요약: "할랄 · 돼지고기" */
export const hitLine = (h: GuardHit) => `${h.label.replace(/\s*\(.+\)$/, "")} · ${h.reasons.map((r) => FLAG_LABEL[r].replace(/\(.+\)$/, "")).join("·")}`;
