import Link from "next/link";
import { notFound } from "next/navigation";
import { FoodCard, accentBg } from "@/components/FoodCard";
import { PreviewBanner } from "@/components/bits";
import { getContent } from "@/lib/content";

export const dynamic = "force-dynamic";

// 국가 페이지 (F-EXP-03): Passport 국기 그리드·상세의 국가 링크에서 진입
export default async function CountryPage({ params }: { params: Promise<{ code: string }> }) {
  const content = getContent();
  const data = await content.getCountry((await params).code.toUpperCase());
  if (!data) notFound();
  const { country, foods } = data;
  return (
    <main>
      <header className="flex h-48 flex-col justify-between p-5 pt-[max(1.25rem,env(safe-area-inset-top))]" style={accentBg(country.accent_color)}>
        <Link href="/passport" className="w-fit rounded-full bg-surface/80 px-3 py-1.5 text-sm backdrop-blur">
          ← Passport
        </Link>
        <div>
          <span className="text-6xl" aria-hidden>{country.flag_emoji}</span>
          <h1 className="font-display text-h1 font-semibold">{country.name_ko}</h1>
          <p className="text-sm text-charcoal/70">
            {country.name_en} · {country.region}
          </p>
        </div>
      </header>
      <div className="space-y-4 px-5 pt-5">
        {content.mode === "preview" && <PreviewBanner />}
        {foods.length ? (
          foods.map((f) => <FoodCard key={f.id} food={f} size="L" />)
        ) : (
          <p className="text-sm text-muted">아직 검수된 {country.name_ko} 음식이 없어요. 곧 추가될 예정이에요.</p>
        )}
      </div>
    </main>
  );
}
