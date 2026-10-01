// 라디오 편성: 시작 음식에서 관계 그래프를 따라 다음 이야기를 고른다 (03 문서 #5: 터키 커피 → 비엔나 커피).
// 이어질 관계가 없으면 아직 안 가본 다른 나라로 "점프". 같은 날·같은 채널이면 모두 같은 편성 (공유·대화 소재).
import type { ContentSource, FoodDetail, FoodSummary, RelationType } from "@/lib/content/types";
import { buildEpisode, type Bridge, type Episode, type RadioFood } from "./script";

export const CHANNELS = {
  today: { title: "오늘의 라디오", emoji: "📻", continent: null },
  asia: { title: "아시아 한 바퀴", emoji: "🥢", continent: "asia" },
  europe: { title: "유럽 카페 골목", emoji: "☕", continent: "europe" },
  mena_africa: { title: "중동·아프리카 시장", emoji: "🫓", continent: "mena_africa" },
  americas: { title: "아메리카 대륙", emoji: "🌽", continent: "americas" },
} as const;
export type ChannelId = keyof typeof CHANNELS;
export const isChannel = (v: string | null): v is ChannelId => !!v && v in CHANNELS;

/** 이야기가 자연스럽게 이어지는 순서 */
const PRIORITY: RelationType[] = ["historical_link", "regional_variant", "shares_ingredient", "same_technique", "similar_taste"];

function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h >>>= 0) % 10_000) / 10_000;
  };
}

const toRadio = (d: FoodDetail): RadioFood => ({
  id: d.id,
  slug: d.slug,
  name_ko: d.name_ko,
  country_name: d.country_name,
  country_code: d.country_code,
  flag: d.flag,
  accent: d.accent,
  image_url: d.image_url,
  image_credit: d.image_credit,
  taste_tags: d.taste_tags,
  summary: d.summary,
  origin_note: d.origin_note,
  history: d.history,
  culture_story: d.culture_story,
});

export async function buildRadio(
  content: ContentSource,
  opts: { channel: ChannelId; start?: string | null; explored?: string[]; count?: number; day?: string },
): Promise<{ channel: ChannelId; title: string; episodes: Episode[] }> {
  const count = Math.min(Math.max(opts.count ?? 5, 1), 8);
  const explored = new Set(opts.explored ?? []);
  const ch = CHANNELS[opts.channel];
  const [foods, countries] = await Promise.all([content.listFoods(), ch.continent ? content.listCountries() : Promise.resolve([])]);
  const inChannel = ch.continent ? new Set(countries.filter((c) => c.continent_group === ch.continent).map((c) => c.code)) : null;
  const pool = foods.filter((f) => !inChannel || inChannel.has(f.country_code));
  const rand = seeded(`${opts.day ?? new Date().toISOString().slice(0, 10)}:${opts.channel}`);

  // 안 가본 나라 우선, 그 안에서 날짜 시드
  const pick = (cands: FoodSummary[], avoidCountry?: string): FoodSummary | undefined => {
    const scored = cands.map((f) => ({ f, s: (explored.has(f.country_code) ? 0 : 2) + (f.country_code === avoidCountry ? -1 : 0) + rand() }));
    return scored.sort((a, b) => b.s - a.s)[0]?.f;
  };

  const startSlug = opts.start ?? pick(pool)?.slug;
  if (!startSlug) return { channel: opts.channel, title: ch.title, episodes: [] };

  const visited = new Set<string>();
  const chain: { detail: FoodDetail; bridge?: Bridge }[] = [];
  let cur = await content.getFood(startSlug);
  let bridge: Bridge | undefined;
  while (cur && chain.length < count) {
    visited.add(cur.slug);
    chain.push({ detail: cur, bridge });
    const rel = cur.relations
      .filter((r) => !visited.has(r.food.slug))
      .sort((a, b) => PRIORITY.indexOf(a.type) - PRIORITY.indexOf(b.type) || Number(explored.has(a.food.country_code)) - Number(explored.has(b.food.country_code)))[0];
    let nextSlug: string | undefined;
    if (rel) {
      nextSlug = rel.food.slug;
      bridge = { kind: "relation", type: rel.type, description: rel.description };
    } else {
      const from = cur.country_code;
      nextSlug = pick(
        pool.filter((f) => !visited.has(f.slug)),
        from,
      )?.slug;
      bridge = { kind: "jump" };
    }
    if (chain.length >= count || !nextSlug) break;
    cur = await content.getFood(nextSlug);
  }

  const episodes = chain.map((c, i) => {
    const nx = chain[i + 1];
    return buildEpisode(toRadio(c.detail), {
      first: i === 0,
      next: nx ? { food: { name_ko: nx.detail.name_ko, country_name: nx.detail.country_name, flag: nx.detail.flag }, bridge: nx.bridge ?? { kind: "jump" } } : undefined,
    });
  });
  return { channel: opts.channel, title: ch.title, episodes };
}
