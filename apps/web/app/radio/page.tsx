import { RadioView } from "@/components/RadioView";
import { getContent } from "@/lib/content";
import { CHANNELS } from "@/lib/radio/queue";

export const metadata = { title: "Radio — FOODIS" };
export const dynamic = "force-dynamic";

// S6 Food Culture Radio (F-VOI-05). ?start=<slug> 이면 그 음식부터 이어 듣기 버튼을 먼저 보여 준다 (자동 재생은 브라우저가 막는다)
export default async function RadioPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const { start } = await searchParams;
  const content = await getContent();
  const food = start && /^[a-z0-9-]{1,80}$/.test(start) ? await content.getFood(start) : null;
  // 들려줄 음식이 없는 대륙 채널은 "준비 중"으로 (국가는 150개지만 검수된 음식은 일부 나라부터 채워진다)
  const [foods, countries] = await Promise.all([content.listFoods(), content.listCountries()]);
  const cont = new Map(countries.map((c) => [c.code, c.continent_group]));
  const has = (continent: string | null) => !continent || foods.some((f) => cont.get(f.country_code) === continent);
  return (
    <RadioView
      channels={Object.entries(CHANNELS).map(([id, c]) => ({ id, title: c.title, emoji: c.emoji, ready: has(c.continent) }))}
      preview={content.mode === "preview"}
      startFood={food ? { slug: food.slug, name_ko: food.name_ko, flag: food.flag } : null}
    />
  );
}
