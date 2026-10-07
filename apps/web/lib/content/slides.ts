// 홈 '랜덤 음식 슬라이드'(components/FoodMarquee) 고르기 — 서버에서 요청마다 새로 뽑는다 (홈은 force-dynamic)
import type { FoodSummary } from "./types";

export type SlideFood = { slug: string; name_ko: string; flag: string; accent: string; country_name: string; country_code: string; image_url: string; taste_tags: string[] };

/** 사진 있는 음식 중에서 나라가 겹치지 않게 n 개를 무작위로. 화면에 필요한 칸만 남겨 HTML 을 가볍게 */
export function pickSlides(foods: FoodSummary[], n: number, rand: () => number = Math.random): SlideFood[] {
  const pool = foods.filter((f) => f.image_url);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const seen = new Set<string>();
  const out: SlideFood[] = [];
  for (const f of pool) {
    if (seen.has(f.country_code)) continue;
    seen.add(f.country_code);
    out.push({ slug: f.slug, name_ko: f.name_ko, flag: f.flag, accent: f.accent, country_name: f.country_name, country_code: f.country_code, image_url: f.image_url!, taste_tags: f.taste_tags });
    if (out.length === n) break;
  }
  return out;
}
