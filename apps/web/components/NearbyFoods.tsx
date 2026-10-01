"use client";
// 음식이 아직 없는 나라 페이지의 "가까운 나라 음식" — 막다른 화면 금지 (05 문서)
import type { FoodSummary } from "@/lib/content/types";
import { FoodCard } from "./FoodCard";
import { Section } from "./bits";

export function NearbyFoods({ foods }: { foods: FoodSummary[] }) {
  return (
    <Section title="가까운 나라에서 먼저 맛보기">
      <div className="grid grid-cols-2 gap-3">
        {foods.map((f) => (
          <FoodCard key={f.id} food={f} size="M" fluid />
        ))}
      </div>
    </Section>
  );
}
