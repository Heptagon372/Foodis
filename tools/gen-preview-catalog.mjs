// 음식 목록(카탈로그) 생성: foodis-data 시드 + 근거 수집 결과 → apps/web/lib/preview/catalog.json
//   node tools/gen-preview-catalog.mjs
// 입력: foodis-data/data/seed/dish_targets.csv (목표 음식) · data/raw/wikidata.json (s01) · data/raw/wikipedia.json (s02 + s02b 사진)
//       · data/raw/expand_report.json (s00, 언어판 수)
// 출력 필드: 이름 · 나라 · 유명도 순위(fame) · 대략의 맛 태그 · 사진 + 출처 표기 · 위키 문서 링크
// 소개 문장·식이 정보는 넣지 않는다 (사람 검수 전) → 화면은 이름·사진·나라만 보여 주고 "소개 준비 중" 으로 안내한다
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parseCsv } from "../scripts/session-report.mjs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const json = (p) => (existsSync(new URL(p, root)) ? JSON.parse(read(p)) : {});

const targets = parseCsv(read("foodis-data/data/seed/dish_targets.csv"));
const wd = json("foodis-data/data/raw/wikidata.json");
const wp = json("foodis-data/data/raw/wikipedia.json");
const report = json("foodis-data/data/raw/expand_report.json");
const sitelinks = Object.fromEntries((report.added ?? []).map((r) => [r.slug, r.sitelinks]));

// 대략의 맛 태그: Wikidata 분류(영문 라벨) + 영문 이름의 낱말. 취향 엔진이 비슷한 음식을 묶는 데만 쓴다 (화면에 단정해서 보여 주지 않음)
const TAG_RULES = [
  [/\b(soup|broth|pho|ramen|chowder|bisque|consomm)/, "soupy"],
  [/\b(stew|curry|goulash|tagine|casserole)/, "rich"],
  [/\b(noodle|noodles|pasta|spaghetti|udon|soba|ramen|lo mein|vermicelli|macaroni)/, "noodle"],
  [/\b(rice|pilaf|pilau|biryani|risotto|paella|congee|plov)\b/, "rice"],
  [/\b(bread|breads|flatbread|loaf|roti|naan|pita|tortilla|bagel|baguette|pancake|crepe|baked good)\b/, "bread"],
  [/\b(dumpling|dumplings|ravioli|pierogi|momo|gyoza|mandu|empanada|samosa)/, "dumpling"],
  [/\b(cake|dessert|pastry|confection|sweet|pudding|cookie|biscuit|candy|tart|pie|doughnut|ice cream|custard|jam|halva)/, "sweet"],
  [/\b(fried|fritter|deep-fried|tempura|chips|croquette)/, "fried"],
  [/\b(grilled|kebab|kabob|barbecue|skewer|satay|roast|roasted|asado)/, "grilled"],
  [/\b(sausage|meat|beef|pork|lamb|mutton|chicken|duck|goat|ham|bacon|veal|meatball)/, "meat"],
  [/\b(fish|seafood|shrimp|prawn|crab|squid|octopus|oyster|clam|mussel|salmon|cod|tuna|herring|eel)/, "seafood"],
  [/\b(salad|vegetable|vegetables|greens|spinach|cabbage|eggplant|aubergine)/, "vegetable"],
  [/\b(cheese|yogurt|yoghurt|dairy|butter|cream|milk|curd)/, "dairy"],
  [/\b(pickle|pickled|fermented|kimchi|sauerkraut)/, "fermented"],
  [/\b(chili|chilli|pepper|spicy|hot sauce|curry)/, "spicy"],
  [/\b(bean|beans|lentil|lentils|chickpea|chickpeas|legume|tofu|soy|dal|dhal)/, "legume"],
  [/\b(street food|snack)/, "street_food"],
  [/\b(sour|vinegar|lime|lemon|tamarind)/, "sour"],
  [/\b(smoked|smoky)/, "smoky"],
];
// 상위 분류(s01 class_labels: "pho → noodle soup → soup")도 쓴다. 통계·산업 분류(OKPD 등)와 너무 넓은 분류는 뺀다
// ("Bakery products, pastry, cakes …" 가 프레첼을 단맛으로 만들지 않게)
const NOISY_CLASS = /okpd|products|services|industry|classifier|production|goods|matter|entity|object|process|food and beverage|ingredient|plant|vegetarian/i;
function tagsOf(t, w) {
  const classes = (w?.class_labels ?? []).filter((c) => !NOISY_CLASS.test(c));
  const text = [t.name_en, ...(w?.instance_of ?? []), ...classes].join(" | ").toLowerCase();
  const tags = [];
  for (const [re, tag] of TAG_RULES) if (re.test(text) && !tags.includes(tag)) tags.push(tag);
  return tags.slice(0, 4);
}

function credit(img) {
  if (!img) return null;
  const where = img.source === "openverse" ? `${img.provider ?? "openverse"}` : "Wikimedia Commons";
  return [img.artist || "작가 미상", img.license, img.page || where].filter(Boolean).join(" / ");
}

const wikiUrl = (t, w) => {
  const hint = t.wiki_en_title;
  const m = /^([a-z]{2}):(.+)$/.exec(hint);
  const [lang, title] = m ? [m[1], m[2]] : ["en", w?.en_title ?? hint];
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
};

// 유명도 순위: 나라 안에서 ① 사람이 고른 목표(시드 순서 = 대표성 순) → ② 자동 후보는 언어판 수 많은 순
const byCountry = new Map();
targets.forEach((t, i) => {
  const list = byCountry.get(t.country_code) ?? [];
  const manual = !t.origin_note.startsWith("자동 후보");
  list.push({ t, key: manual ? [0, i] : [1, -(sitelinks[t.slug] ?? Number(/언어판 (\d+)/.exec(t.origin_note)?.[1] ?? 0))] });
  byCountry.set(t.country_code, list);
});
const fame = {};
for (const list of byCountry.values()) {
  list.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1]);
  list.forEach((x, i) => (fame[x.t.slug] = i + 1));
}

const missingKo = [];
const items = targets.map((t) => {
  const w = wd[t.slug];
  const img = wp[t.slug]?.image ?? null;
  if (!t.name_ko) missingKo.push(t.slug);
  return {
    s: t.slug,
    ko: t.name_ko || t.name_en,
    en: t.name_en,
    cc: t.country_code,
    r: fame[t.slug],
    tg: tagsOf(t, w),
    ...(img ? { img: img.url.replace(/\?utm_[^#]*$/, ""), cr: credit(img) } : {}),
    w: wikiUrl(t, w),
  };
});

writeFileSync(new URL("apps/web/lib/preview/catalog.json", root), JSON.stringify(items));
const withImg = items.filter((x) => x.img).length;
console.log(`${items.length}개 음식 (사진 ${withImg}) · ${byCountry.size}개국 → apps/web/lib/preview/catalog.json`);
if (missingKo.length) console.log(`⚠ 한국어 이름 없음 ${missingKo.length}건 (영문으로 표시): ${missingKo.slice(0, 10).join(", ")}…`);
