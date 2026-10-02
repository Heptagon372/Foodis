// 커뮤니티 카테고리 한 곳에서 정의 — DB check 제약(0006_community.sql) · API 검증 · 화면 칩이 모두 이 표를 쓴다.
// 큰 갈래 둘: 밥친구(같이 먹을 사람 찾기) / 모임(취향·식단·요리권별 이야기방)
import type { IconName } from "@/components/icons";

export const CATEGORY_KEYS = ["buddy", "diet", "halal", "vegetarian", "meat", "collab", "korean", "chinese", "western", "japanese", "etc"] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export type Board = "buddy" | "club";
export type Category = { key: CategoryKey; board: Board; label: string; icon: IconName; blurb: string };

export const CATEGORIES: Category[] = [
  { key: "buddy", board: "buddy", label: "밥친구", icon: "utensils", blurb: "오늘 같이 밥 먹을 사람" },
  { key: "diet", board: "club", label: "다이어트", icon: "flame", blurb: "가볍게, 꾸준히" },
  { key: "halal", board: "club", label: "할랄", icon: "moon", blurb: "할랄 식당·장보기 정보" },
  { key: "vegetarian", board: "club", label: "채식", icon: "leaf", blurb: "비건·베지테리언" },
  { key: "meat", board: "club", label: "육식", icon: "beef", blurb: "고기 맛집 원정대" },
  { key: "collab", board: "club", label: "콜라보", icon: "party", blurb: "세계 음식 × 음식 실험" },
  { key: "korean", board: "club", label: "한식", icon: "soup", blurb: "집밥부터 노포까지" },
  { key: "chinese", board: "club", label: "중식", icon: "pot", blurb: "마라부터 딤섬까지" },
  { key: "western", board: "club", label: "양식", icon: "pizza", blurb: "파스타·스테이크·브런치" },
  { key: "japanese", board: "club", label: "일식", icon: "fish", blurb: "스시·라멘·이자카야" },
  { key: "etc", board: "club", label: "기타 음식점", icon: "chef", blurb: "동남아·중동·남미…" },
];

export const CATEGORY: Record<CategoryKey, Category> = Object.fromEntries(CATEGORIES.map((c) => [c.key, c])) as Record<CategoryKey, Category>;
export const CLUB_KEYS = CATEGORIES.filter((c) => c.board === "club").map((c) => c.key);
export const isCategory = (v: unknown): v is CategoryKey => typeof v === "string" && (CATEGORY_KEYS as readonly string[]).includes(v);

/** 피드 필터: all · buddy · club(모임 전체) · 개별 모임 */
export type FeedFilter = "all" | "club" | CategoryKey;
export const filterCategories = (f: FeedFilter): CategoryKey[] | null => (f === "all" ? null : f === "club" ? CLUB_KEYS : [f]);

// ── 글쓰기 도우미: 제목·본문 단어로 카테고리 추천 (규칙 — 즉시·무료. 사용자가 고른 값이 항상 우선)
const RULES: [CategoryKey, RegExp][] = [
  ["buddy", /같이\s*(먹|드실|가실|갈)|밥\s*친구|혼밥\s*탈출|함께\s*(먹|식사)|한\s*분|두\s*분|모집|구해요|구합니다|점심\s*메이트|저녁\s*메이트|\d+\s*명/],
  ["halal", /할랄|halal|무슬림|이슬람|돼지고기\s*(없|빼|안)/i],
  ["vegetarian", /채식|비건|vegan|베지|채식주의|두부\s*요리|고기\s*없는|플렉시테리언/i],
  ["diet", /다이어트|칼로리|저탄|단백질|샐러드|식단|체중|헬시|건강식|키토/],
  ["meat", /고기|삼겹|갈비|스테이크|바비큐|bbq|숯불|곱창|육회|소고기|돼지고기|양꼬치|치킨/i],
  ["collab", /콜라보|퓨전|섞어|조합|레시피\s*실험|크로스오버|만나면/],
  ["japanese", /스시|초밥|라멘|우동|돈카츠|돈까스|이자카야|오마카세|덴푸라|일식|규동|오니기리|타코야키|오코노미야키/],
  ["chinese", /마라|훠궈|짜장|짬뽕|탕수육|딤섬|샤오룽바오|중식|마파두부|양장피|베이징|꿔바로우/],
  ["western", /파스타|피자|스테이크|브런치|양식|버거|리소토|라자냐|카르보나라|크루아상|타코/],
  ["korean", /한식|김치|비빔밥|불고기|떡볶이|찌개|국밥|백반|냉면|삼계탕|노포|분식/],
  ["etc", /쌀국수|팟타이|똠얌|커리|카레|케밥|팔라펠|후무스|반미|타코|멕시칸|인도|태국|베트남|중동|튀르키예|터키/],
];

/** 점수 높은 순 최대 3개. 같은 점수면 표 순서(밥친구·식단 쪽이 먼저) */
export function suggestCategories(text: string): CategoryKey[] {
  const t = text.slice(0, 2000);
  const scored = RULES.map(([k, re], i) => ({ k, i, n: (t.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) ?? []).length })).filter((s) => s.n > 0);
  return scored.sort((a, b) => b.n - a.n || a.i - b.i).slice(0, 3).map((s) => s.k);
}
