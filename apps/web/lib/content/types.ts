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
  /** 재료 이름 — 있으면 식단 카테고리 경고(lib/diet/guard)가 더 정확해진다 */
  ingredient_names?: string[];
  /** 그 나라 안에서의 유명도 순위 (1 = 가장 대표적인 음식). 취향 엔진의 '대표 음식 먼저' 규칙에 쓴다 */
  fame_rank?: number | null;
};

export type RelationType = "similar_taste" | "shares_ingredient" | "same_technique" | "historical_link" | "regional_variant";

/** 갤러리 사진 한 장. 라이선스가 분명하지 않은 소스(web)는 "출처 페이지로 바로 가기"로만 쓴다 */
export type GalleryPhoto = {
  url: string;
  thumb: string;
  title: string;
  /** wikimedia_commons · openverse · web (DuckDuckGo 결과) */
  source: "wikimedia_commons" | "openverse" | "web";
  license: string;
  credit_url: string | null;
  author: string | null;
  /** 음식 이름 매칭 점수 (0~1). s10_gallery.py 가 매긴 값 */
  fit: number;
};

/** 유튜브 영상 한 개 — s11_youtube.py 가 음식 이름 매칭·조회수·길이 검증을 통과한 결과 */
export type YouTubeVideo = {
  video_id: string;
  url: string;
  title: string;
  channel: string;
  duration_sec: number;
  view_count: number;
  fit?: number;
};

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
  /** 갤러리: 다양한 출처에서 모은 사진 (최대 5장). image_url 과 겹칠 수 있다 */
  gallery: GalleryPhoto[];
  /** 유튜브 대표 영상 (없을 수 있음). UI 는 유튜브 아이콘을 눌러 새 창으로 연다 */
  youtube: YouTubeVideo | null;
};

export interface ContentSource {
  readonly mode: "live" | "preview";
  listCountries(): Promise<Country[]>;
  listFoods(): Promise<FoodSummary[]>;
  /** 음식 수 — listFoods 는 한 번에 최대 1,000행(PostgREST 상한)이라 화면에 보일 개수는 이걸로 센다 */
  countFoods(): Promise<number>;
  getFood(slug: string): Promise<FoodDetail | null>;
  getCountry(code: string): Promise<{ country: Country; foods: FoodSummary[] } | null>;
  /** 재료 탐색 (F-EXP-04): 이 재료를 쓰는 검수된 음식 */
  getIngredient(slug: string): Promise<{ ingredient: { slug: string; name_ko: string; name_en: string | null; category: string | null }; foods: FoodSummary[] } | null>;
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
