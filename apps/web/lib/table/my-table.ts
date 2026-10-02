// My Table (F-REC-04): 탐험한 음식을 식탁 위 접시로 — 화면(components/MyTable.tsx)과 이미지 저장(lib/client/table-card.ts)이 같은 배치를 쓴다.
// 순수 함수만 둔다 (vitest 로 겹침·경계 검사).
import type { PassportEntry, PassportStatus } from "@/lib/client/passport";
import type { Country, FoodSummary } from "@/lib/content/types";
import type { IconName } from "@/components/icons";

/** 서버(getContent)에서 받아 오는 음식·국가 조회표 — Passport 기록에는 사진·국가색이 없다 */
export type TableFood = { id: string; slug: string; image_url: string | null; image_credit: string | null; accent: string; country_name: string };
export type TableCountry = { code: string; name_ko: string; flag: string; accent: string; continent: string };
// 클라이언트로 넘기는 크기를 줄이려고 필요한 필드만
export const toTableFood = (f: FoodSummary): TableFood => ({ id: f.id, slug: f.slug, image_url: f.image_url, image_credit: f.image_credit, accent: f.accent, country_name: f.country_name });
export const toTableCountry = (c: Country): TableCountry => ({ code: c.code, name_ko: c.name_ko, flag: c.flag_emoji, accent: c.accent_color, continent: c.continent_group });

export type TablePlate = {
  id: string;
  slug: string;
  name: string;
  flag: string;
  country: string;
  accent: string;
  continent: string | null;
  image: string | null;
  credit: string | null;
  /** 사진이 없을 때 접시 위에 그리는 음식 모양 (라인 아이콘 이름) */
  icon: IconName;
  statuses: PassportStatus[];
};

/** 한 상에 올리는 최대 접시 수 — 그 이상이면 최근 것만 (접시가 손가락보다 작아지지 않게) */
export const MAX_PLATES = 60;
/** 조회표에 없는 음식(지난 미리보기 기록 등)의 접시 색 — 옅은 세이지 (흰 음식 모양이 보이는 밝기) */
export const DEFAULT_ACCENT = "#9DB096";

export const CONTINENT_LABEL: Record<string, string> = { asia: "아시아", europe: "유럽", mena_africa: "중동·아프리카", americas: "아메리카", oceania: "오세아니아" };
/** 접시 테두리 띠 = 대륙 색. 국가 Accent(접시 안쪽)와 겹치지 않게 채도를 낮춘 톤 */
export const CONTINENT_COLOR: Record<string, string> = { asia: "#D2694F", europe: "#5B7FC7", mena_africa: "#D39B32", americas: "#3E9A6C", oceania: "#2E9CB0" };

// 맛 태그 → 접시 위 음식 모양 (라인 아이콘 — 이모지는 쓰지 않는다, docs/design/09 §5). 앞에 있을수록 '무슨 음식인지'를 더 잘 말해 주는 태그
const FOOD_ICONS: [string, IconName][] = [
  ["noodle", "soup"],
  ["dumpling", "chef"],
  ["soupy", "soup"],
  ["rice", "bean"],
  ["bread", "wheat"],
  ["sweet", "cake"],
  ["seafood", "shrimp"],
  ["grilled", "beef"],
  ["fried", "shrimp"],
  ["meat", "drumstick"],
  ["legume", "bean"],
  ["vegetable", "salad"],
  ["dairy", "milk"],
  ["fermented", "jar"],
  ["street_food", "sandwich"],
];
/** 음식 모양 아이콘 — 맞는 태그가 없으면 수저 */
export const foodIcon = (tags: string[]): IconName => FOOD_ICONS.find(([t]) => tags.includes(t))?.[1] ?? "utensils";

/** Passport 기록 → 접시 목록. 탐험한 순서(오래된 것 먼저)로, 넘치면 최근 MAX 개만 */
export function setTable(entries: Record<string, PassportEntry>, foods: TableFood[], countries: TableCountry[], max = MAX_PLATES): { plates: TablePlate[]; hidden: number } {
  const byId = new Map(foods.map((f) => [f.id, f]));
  const bySlug = new Map(foods.map((f) => [f.slug, f]));
  const byCode = new Map(countries.map((c) => [c.code, c]));
  const all = Object.entries(entries)
    .sort((a, b) => a[1].at - b[1].at)
    .map(([id, e]): TablePlate => {
      // 미리보기 ↔ 실DB 처럼 id 가 바뀐 기록도 slug 로 한 번 더 찾는다
      const f = byId.get(id) ?? bySlug.get(e.slug);
      const c = byCode.get(e.cc);
      return {
        id,
        slug: e.slug,
        name: e.name_ko,
        // 국기를 모르면 빈 문자열 → 화면은 위치 핀 아이콘, 이미지는 국기 생략
        flag: e.flag || c?.flag || "",
        country: f?.country_name ?? c?.name_ko ?? "",
        accent: f?.accent ?? c?.accent ?? DEFAULT_ACCENT,
        continent: c?.continent ?? null,
        image: f?.image_url ?? null,
        credit: f?.image_credit ?? null,
        icon: foodIcon(e.tags),
        statuses: e.statuses,
      };
    });
  return { plates: all.slice(-max), hidden: Math.max(0, all.length - max) };
}

export type TableLayout = { r: number; plates: { x: number; y: number }[] };

/** 접시 사이 여백 (지름 대비) */
export const PLATE_GAP = 0.14;

/**
 * n 개의 접시를 w×h 식탁(안쪽 영역)에 한상차림처럼 엇갈린 줄로 놓는다.
 * 열 수 × (엇갈림 여부)를 모두 시도해 접시가 가장 커지는 배치를 고르고, 같으면 빈자리가 적은 쪽 → 엇갈린 쪽.
 * 보장: 접시끼리 겹치지 않고(중심 거리 ≥ 2r) 식탁 밖으로 나가지 않는다.
 */
export function tableLayout(n: number, w: number, h: number): TableLayout {
  if (n <= 0) return { r: 0, plates: [] };
  // 접시가 적을 때 식탁을 접시 하나가 다 차지하지 않게 상한
  const maxR = Math.min(w, h) * 0.17;
  type Plan = { r: number; d: number; sx: number; syMin: number; rows: number[]; caps: number[]; stagger: boolean; empty: number };
  let best: Plan | null = null;
  for (let cols = 1; cols <= n; cols++) {
    for (const stagger of [true, false]) {
      if (stagger && cols < 2) continue;
      const sx = w / cols;
      const r = Math.min(maxR, sx / (2 * (1 + PLATE_GAP)));
      const d = 2 * r * (1 + PLATE_GAP); // 이웃 접시 중심 사이 최소 거리 (≤ sx)
      // 엇갈린 줄: 대각 이웃이 d 이상, 두 줄 건너 같은 열(2·sy)도 d 이상
      const syMin = stagger ? Math.max(d / 2, Math.sqrt(Math.max(0, d * d - (sx / 2) ** 2))) : d;
      const rows: number[] = [];
      const caps: number[] = [];
      for (let left = n, i = 0; left > 0; i++) {
        const cap = stagger && i % 2 ? cols - 1 : cols;
        rows.push(Math.min(cap, left));
        caps.push(cap);
        left -= cap;
      }
      if ((rows.length - 1) * syMin + d > h + 1e-9) continue;
      const empty = caps.reduce((a, b) => a + b, 0) - n;
      const plan: Plan = { r, d, sx, syMin, rows, caps, stagger, empty };
      if (!best || r > best.r + 1e-9 || (Math.abs(r - best.r) <= 1e-9 && (empty < best.empty || (empty === best.empty && stagger && !best.stagger)))) best = plan;
    }
  }
  // 한 줄로도 안 들어가는 극단적 비율(사실상 없음)에는 빈 배치 대신 세로 한 줄로 줄여 놓는다
  if (!best) {
    const r = Math.min(w / (2 * (1 + PLATE_GAP)), h / (2 * n * (1 + PLATE_GAP)));
    const d = 2 * r * (1 + PLATE_GAP);
    return { r, plates: Array.from({ length: n }, (_, i) => ({ x: w / 2, y: (h - n * d) / 2 + d / 2 + i * d })) };
  }
  const { r, d, sx, syMin, rows, caps, stagger } = best;
  // 줄 간격: 식탁 높이에 맞게 벌리되 너무 듬성듬성하지 않게
  const sy = rows.length > 1 ? Math.max(syMin, Math.min((h - d) / (rows.length - 1), d * 1.2)) : 0;
  const y0 = (h - (rows.length - 1) * sy) / 2;
  const plates: { x: number; y: number }[] = [];
  rows.forEach((k, i) => {
    // 덜 찬 마지막 줄: 엇갈린 배치에서는 자기 줄 격자 위에서 가운데로 (반 칸 밀리면 윗줄 접시와 세로로 겹칠 수 있다)
    const off = stagger ? Math.floor((caps[i] - k) / 2) - (caps[i] - 1) / 2 : -(k - 1) / 2;
    for (let j = 0; j < k; j++) plates.push({ x: w / 2 + (j + off) * sx, y: y0 + i * sy });
  });
  return { r, plates };
}
