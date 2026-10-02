// 글 → DB 음식·나라 연결. 글을 쓰면 본문에서 우리 DB 에 있는 음식 이름을 찾아 붙인다 (지식 그래프와 커뮤니티를 잇는 다리).
// LLM 이 아니라 이름 일치라서 지어낸 음식이 붙지 않는다 — "DB가 사실, AI는 해설" 원칙 그대로.
export type TagVocab = {
  foods: { slug: string; name_ko: string; name_en: string }[];
  countries: { code: string; name_ko: string }[];
};

const MAX_FOODS = 5;
const MAX_COUNTRIES = 3;

/** 한 글자 이름(예: "퍼")은 다른 낱말 속에 너무 흔해 붙이지 않는다. 영어 이름은 단어 경계로만 */
export function matchTags(text: string, vocab: TagVocab): { food_slugs: string[]; country_codes: string[] } {
  const t = text.slice(0, 4000);
  const lower = t.toLowerCase();
  const hits: { slug: string; at: number; len: number }[] = [];
  for (const f of vocab.foods) {
    const ko = f.name_ko.replace(/\s+/g, "");
    const at = ko.length >= 2 ? t.replace(/\s+/g, "").indexOf(ko) : -1;
    const en = f.name_en.toLowerCase();
    const enAt = en.length >= 3 ? lower.search(new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)) : -1;
    const pos = at >= 0 ? at : enAt;
    if (pos >= 0) hits.push({ slug: f.slug, at: pos, len: Math.max(ko.length, 0) });
  }
  // 긴 이름이 먼저 (예: "그린 커리"가 있으면 "커리"보다 앞), 그다음 글에서 먼저 나온 순
  const food_slugs = [...new Set(hits.sort((a, b) => b.len - a.len || a.at - b.at).map((h) => h.slug))].slice(0, MAX_FOODS);
  const country_codes = vocab.countries.filter((c) => c.name_ko.length >= 2 && t.includes(c.name_ko)).map((c) => c.code).slice(0, MAX_COUNTRIES);
  return { food_slugs, country_codes };
}
