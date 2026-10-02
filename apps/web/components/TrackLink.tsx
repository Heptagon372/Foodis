"use client";
// 음식 카드 링크 + 취향 신호(클릭). 서버 컴포넌트(FoodCard)에서도 쓸 수 있게 따로 둔다.
import Link from "next/link";
import type { ComponentProps } from "react";
import { clearImpression, signal } from "@/lib/client/taste";

export function TrackLink({ food, src, onClick, ...props }: ComponentProps<typeof Link> & { food?: { slug: string; country_code?: string; taste_tags?: string[] }; src?: string }) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        if (food?.country_code) {
          signal("click", { slug: food.slug, country_code: food.country_code, taste_tags: food.taste_tags }, src ? { src } : {});
          clearImpression(food.slug);
        }
        onClick?.(e);
      }}
    />
  );
}
