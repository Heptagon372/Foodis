// 카카오맵 장소 상세에서 메뉴판·영업시간·영업 중 여부·가까운 지하철역을 가져온다 (서버 전용).
// place-api.map.kakao.com 내부 API: /places/panel3/{placeId} (확인일 2026-10-03, 예전 /main/v/{id} 는 404)
//   menu.menus.items[] {name, price, ai_mate_desc} · open_hours.headline {code, display_text, display_text_info}
//   open_hours.week_from_today.week_periods[].days[] · find_way.subway {station_simple_name, exit_num, to_exit_minute}
// 화면 표시용으로만 쓰고 DB 에 저장하지 않는다. 메모리 캐시 10분.
import "server-only";

export type MenuItem = { name: string; price: string | null; desc: string | null; photo: string | null };
export type DayHours = { day: string; text: string };
export type Subway = { station: string; exit: string | null; walkMin: number | null };

export type PlaceMenu = {
  menu: MenuItem[];
  hours: DayHours[];
  /** 지금 영업 중인지. null = 모름 */
  openNow: boolean | null;
  offDays: string | null;
  /** "영업 중 · 22:00 까지" 처럼 카카오가 계산해 준 문구 */
  statusText: string;
  subway: Subway | null;
};

const EMPTY: PlaceMenu = { menu: [], hours: [], openNow: null, offDays: null, statusText: "영업 정보 없음", subway: null };
const TIMEOUT_MS = 5000;

type Raw = {
  menu?: { menus?: { items?: { name?: string; price?: number | string | null; ai_mate_desc?: string; desc?: string; photo?: { url?: string } | null }[] } };
  open_hours?: {
    headline?: { code?: string; display_text?: string; display_text_info?: string };
    week_from_today?: { week_periods?: { days?: { day_of_the_week_desc?: string; on_days?: { start_end_time_desc?: string }; off_days_desc?: string }[] }[] };
  };
  find_way?: { subway?: { station_simple_name?: string; exit_num?: string; to_exit_minute?: number } };
};

const won = (p: number | string | null | undefined) => (p == null || p === "" ? null : typeof p === "number" ? `${p.toLocaleString("ko-KR")}원` : String(p));

export function parsePanel(j: Raw): PlaceMenu {
  const menu: MenuItem[] = (j.menu?.menus?.items ?? [])
    .map((m) => ({ name: (m.name ?? "").trim(), price: won(m.price), desc: (m.ai_mate_desc ?? m.desc ?? "").trim() || null, photo: m.photo?.url ?? null }))
    .filter((m) => m.name)
    .slice(0, 40);

  const hours: DayHours[] = [];
  const off: string[] = [];
  for (const period of j.open_hours?.week_from_today?.week_periods ?? [])
    for (const d of period.days ?? []) {
      const day = (d.day_of_the_week_desc ?? "").trim();
      if (!day) continue;
      const text = d.on_days?.start_end_time_desc?.trim() || d.off_days_desc?.trim() || "";
      if (!text) continue;
      hours.push({ day, text });
      if (!d.on_days && d.off_days_desc) off.push(day);
    }

  const h = j.open_hours?.headline;
  const code = h?.code?.toUpperCase();
  const openNow = !code ? null : code === "OPEN";
  const statusText = h?.display_text ? [h.display_text, h.display_text_info].filter(Boolean).join(" · ") : "영업 정보 없음";

  const s = j.find_way?.subway;
  const subway = s?.station_simple_name ? { station: s.station_simple_name, exit: s.exit_num ?? null, walkMin: s.to_exit_minute ?? null } : null;

  return { menu, hours, openNow, offDays: off.length ? off.join(", ") : null, statusText, subway };
}

export async function crawlKakaoMenu(placeId: string): Promise<PlaceMenu> {
  try {
    const res = await fetch(`https://place-api.map.kakao.com/places/panel3/${placeId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/json",
        Referer: `https://place.map.kakao.com/${placeId}`,
        pf: "web",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return EMPTY;
    return parsePanel((await res.json()) as Raw);
  } catch {
    return EMPTY;
  }
}

const cache = new Map<string, { at: number; data: PlaceMenu }>();
const TTL = 10 * 60_000;

export async function cachedKakaoMenu(placeId: string): Promise<PlaceMenu> {
  const now = Date.now();
  const hit = cache.get(placeId);
  if (hit && now - hit.at < TTL) return hit.data;
  const data = await crawlKakaoMenu(placeId);
  cache.set(placeId, { at: now, data });
  if (cache.size > 200) for (const [k, v] of cache) if (now - v.at > TTL) cache.delete(k);
  return data;
}
