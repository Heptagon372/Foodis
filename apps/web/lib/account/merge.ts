// 게스트 → 회원 전환 (F-AUTH-02) 과 이후 동기화의 병합 규칙. 서버 라우트와 테스트가 같이 쓰는 순수 함수.
//
// - merge (로그인 직후 1번): 이 기기 기록 ∪ 계정 기록. 식이 조건·알레르기도 합집합 — 더 엄격한 쪽이 안전하다
// - push (그 뒤 변경분만): 보낸 음식은 보낸 상태 그대로 덮어쓴다. 안 보낸 음식은 건드리지 않는다
//   (다른 기기에서 추가한 기록을 지우지 않게. 이 앱에는 "탐험 기록 삭제"가 없어서 음식 단위 삭제는 필요 없다)
import { z } from "zod";
import { ALLERGENS, DIET_KEYS } from "@/lib/foodi/schema";

export const STATUSES = ["explored", "tried", "liked", "saved"] as const;
export type Status = (typeof STATUSES)[number];

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const SyncRequest = z.object({
  mode: z.enum(["merge", "push"]),
  prefs: z
    .object({
      diet: z.array(z.enum(DIET_KEYS)).max(DIET_KEYS.length),
      allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length),
      tastes: z.array(z.string().max(30)).max(10),
      onboarded: z.boolean(),
    })
    .optional(),
  entries: z.array(z.object({ food_id: uuid, statuses: z.array(z.enum(STATUSES)).max(4), at: z.number().int().positive() })).max(2000),
});
export type SyncRequest = z.infer<typeof SyncRequest>;

export type Prefs = NonNullable<SyncRequest["prefs"]>;
export type EntryMap = Map<string, { statuses: Set<Status>; at: number }>;

const uniq = <T>(xs: T[]) => [...new Set(xs)];

export function mergePrefs(mode: SyncRequest["mode"], server: Prefs | null, local: Prefs | undefined): Prefs | null {
  if (!local) return server;
  if (mode === "push" || !server) return local;
  return {
    diet: uniq([...server.diet, ...local.diet]),
    allergens: uniq([...server.allergens, ...local.allergens]),
    tastes: uniq([...local.tastes, ...server.tastes]).slice(0, 10),
    onboarded: server.onboarded || local.onboarded,
  };
}

/** 서버 기록에 요청을 반영한 결과 + 실제로 바뀐 음식 id (DB 쓰기 대상) */
export function mergeEntries(mode: SyncRequest["mode"], server: EntryMap, incoming: SyncRequest["entries"]): { next: EntryMap; touched: string[] } {
  const next: EntryMap = new Map([...server].map(([k, v]) => [k, { statuses: new Set(v.statuses), at: v.at }]));
  const touched: string[] = [];
  for (const e of incoming) {
    const prev = next.get(e.food_id);
    const statuses = new Set<Status>(mode === "merge" ? [...(prev?.statuses ?? []), ...e.statuses] : e.statuses);
    // 탐험 기록이 있는 음식은 최소한 "explored" — 좋아요만 끈다고 탐험 국가에서 빠지면 안 된다
    statuses.add("explored");
    const at = Math.min(prev?.at ?? e.at, e.at);
    const same = prev && prev.at === at && prev.statuses.size === statuses.size && [...statuses].every((s) => prev.statuses.has(s));
    if (same) continue;
    next.set(e.food_id, { statuses, at });
    touched.push(e.food_id);
  }
  return { next, touched };
}

/** Food DNA (07 문서 F-PER-01): 클라이언트 lib/client/passport.ts foodDna 와 같은 가중치 */
export function computeDna(entries: EntryMap, tagsOf: (foodId: string) => string[], tastes: string[]): Record<string, number> {
  const w: Record<string, number> = {};
  for (const t of tastes) w[t] = (w[t] ?? 0) + 1;
  for (const [id, e] of entries) {
    const k = e.statuses.has("liked") ? 2 : e.statuses.has("tried") ? 1.5 : 1;
    for (const t of tagsOf(id)) w[t] = (w[t] ?? 0) + k;
  }
  return w;
}
