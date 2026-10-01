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
  return (
    <RadioView
      channels={Object.entries(CHANNELS).map(([id, c]) => ({ id, title: c.title, emoji: c.emoji }))}
      preview={content.mode === "preview"}
      startFood={food ? { slug: food.slug, name_ko: food.name_ko, flag: food.flag } : null}
    />
  );
}
