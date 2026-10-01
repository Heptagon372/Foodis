// 화면이 쓰는 콘텐츠 타입. DB 컬럼(0001_init.sql)을 화면 친화적으로 묶은 것.
import type { DietKey, DietLevel } from "@/lib/foodi/schema";

export type Country = {
  code: string;
  name_ko: string;
  name_en: string;
  region: string;
  continent_group: string;
  flag_emoji: string;
  accent_color: string;
};

export type FoodSummary = {
  id: string;
  slug: string;
  name_ko: string;
  name_en: string;
  country_code: string;
  flag: string;
  accent: string;
  country_name: string;
  summary: string | null;
  taste_tags: string[];
  image_url: string | null;
  image_credit: string | null;
  diet: Record<DietKey, DietLevel>;
  allergens: string[];
};

export type RelationType = "similar_taste" | "shares_ingredient" | "same_technique" | "historical_link" | "regional_variant";

export type FoodDetail = FoodSummary & {
  name_local: string | null;
  country: Country;
  region_in_country: string | null;
  origin_note: string | null;
  history: string | null;
  culture_story: string | null;
  cooking_method: string | null;
  course_type: string | null;
  diet_note: string | null;
  ingredients: { slug: string; name_ko: string; role: string }[];
  sources: { field: string; url: string; title: string | null; license: string | null }[];
  relations: { type: RelationType; description: string; food: FoodSummary }[];
  sameCountry: FoodSummary[];
};

export interface ContentSource {
  readonly mode: "live" | "preview";
  listCountries(): Promise<Country[]>;
  listFoods(): Promise<FoodSummary[]>;
  getFood(slug: string): Promise<FoodDetail | null>;
  getCountry(code: string): Promise<{ country: Country; foods: FoodSummary[] } | null>;
}

export const RELATION_LABEL: Record<RelationType, string> = {
  shares_ingredient: "같은 재료",
  similar_taste: "비슷한 맛",
  same_technique: "같은 조리법",
  historical_link: "역사적 연결",
  regional_variant: "지역 변이",
};

export const TASTE_LABEL: Record<string, string> = {
  spicy: "매운", fermented: "발효", soupy: "국물", sweet: "단맛", sour: "새콤", salty: "짭짤", umami: "감칠맛",
  smoky: "훈연", herbal: "허브", creamy: "크리미", crispy: "바삭", rich: "진한", fresh: "산뜻", nutty: "고소",
  grilled: "구이", fried: "튀김", rice: "쌀", noodle: "면", bread: "빵", dumpling: "만두", meat: "고기",
  seafood: "해산물", vegetable: "채소", legume: "콩", dairy: "유제품", street_food: "길거리",
};
