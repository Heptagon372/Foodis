// 카카오맵 장소 상세에서 메뉴판·영업시간·영업 중 여부를 가져온다 (서버 전용).
// place.map.kakao.com 내부 API: /main/v/{placeId} — 메뉴(menuInfo.menuList), 영업시간(basicInfo.openHour).
// 메뉴/영업시간은 사용자에게 "확인용"으로만 보여주고 DB 에 저장하지 않는다 (카카오 TOS §5-20).
import "server-only";

export type MenuItem = { name: string; price: string | null; desc: string | null; photo: string | null };

export type DayHours = {
  /** 월~일 또는 "매일"·"평일"·"주말" 등 그대로. */
  day: string;
  /** "11:00 - 21:00" 같은 사람이 읽는 문구. 영업하지 않는 날이면 "휴무". */
  text: string;
  /** 파싱된 시작/종료 (분 단위, 자정부터). 못 읽으면 null. */
  open: number | null;
  close: number | null;
};

export type PlaceMenu = {
  menu: MenuItem[];
  /** 요일별 영업시간. 비어 있으면 모름. */
  hours: DayHours[];
  /** 지금 열려 있는지. null = 모름. */
  openNow: boolean | null;
  /** "매주 월요일 휴무" 같은 자유 텍스트. */
  offDays: string | null;
  /** 사람 읽는 간단 요약 (지금 ○시까지 영업·○시에 영업 시작·휴무). */
  statusText: string;
};

const TIMEOUT_MS = 5000;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/javascript, */*; q=0.01",
};

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function parseHHMM(s: string): number | null {
  const m = /(\d{1,2})\s*[:.]\s*(\d{2})/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 30 || mm < 0 || mm >= 60) return null;
  return h * 60 + mm;
}

/** "11:00 ~ 21:00" / "11:00-21:00" 등을 쪼갠다. */
function parseRange(text: string): { open: number | null; close: number | null } {
  const parts = text.split(/[~\-−–—]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return { open: null, close: null };
  return { open: parseHHMM(parts[0]), close: parseHHMM(parts[1]) };
}

type RawHour = { timeName?: string; timeSE?: string; dayOfWeek?: string };

/** 카카오 basicInfo.openHour.periodList 를 DayHours[] 로. 포맷이 바뀌어도 비면 조용히 빈 배열. */
function toHours(raw: unknown): DayHours[] {
  const out: DayHours[] = [];
  if (!raw || typeof raw !== "object") return out;
  const r = raw as { periodList?: RawHour[]; offdayList?: { holidayName?: string; weekAndNo?: string }[] };
  for (const p of r.periodList ?? []) {
    const day = (p.dayOfWeek ?? p.timeName ?? "").trim();
    const text = (p.timeSE ?? "").trim();
    if (!day || !text) continue;
    const { open, close } = parseRange(text);
    out.push({ day, text, open, close });
  }
  return out;
}

function openNow(hours: DayHours[], now: Date): boolean | null {
  if (!hours.length) return null;
  const dow = DAY_NAMES[now.getDay()];
  const row = hours.find((h) => h.day.includes(dow)) ?? hours.find((h) => h.day.includes("매일"));
  if (!row || row.open == null || row.close == null) return hours.length ? false : null;
  const mins = now.getHours() * 60 + now.getMinutes();
  // 24:00 이후 (예: 11:00 - 02:00) 는 종료가 작아진다
  if (row.close < row.open) return mins >= row.open || mins < row.close;
  return mins >= row.open && mins < row.close;
}

function statusOf(hours: DayHours[], open: boolean | null, now: Date): string {
  if (open == null) return "영업 정보 없음";
  const dow = DAY_NAMES[now.getDay()];
  const row = hours.find((h) => h.day.includes(dow));
  if (!row) return open ? "영업 중" : "영업 종료";
  const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  if (open && row.close != null) return `영업 중 · ${fmt(row.close)}에 영업 종료`;
  if (!open && row.open != null) {
    const mins = now.getHours() * 60 + now.getMinutes();
    if (mins < row.open) return `영업 종료 · ${fmt(row.open)}에 영업 시작`;
  }
  return open ? "영업 중" : "영업 종료";
}

type RawMenu = { menu?: string; price?: string; desc?: string; img?: string; photo?: string };

export async function crawlKakaoMenu(placeId: string, now: Date = new Date()): Promise<PlaceMenu> {
  const empty: PlaceMenu = { menu: [], hours: [], openNow: null, offDays: null, statusText: "영업 정보 없음" };
  try {
    const url = `https://place.map.kakao.com/main/v/${placeId}`;
    const res = await fetch(url, {
      headers: { ...HEADERS, Referer: `https://place.map.kakao.com/${placeId}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return empty;
    const data = (await res.json()) as {
      menuInfo?: { menuList?: RawMenu[] };
      basicInfo?: { openHour?: unknown; offdayList?: { holidayName?: string; weekAndNo?: string }[] };
    };

    const menu: MenuItem[] = ((data.menuInfo?.menuList ?? []) as RawMenu[]).slice(0, 40).map((m) => ({
      name: (m.menu ?? "").trim(),
      price: (m.price ?? "").trim() || null,
      desc: (m.desc ?? "").trim() || null,
      photo: m.img ?? m.photo ?? null,
    })).filter((m) => m.name);

    const hours = toHours(data.basicInfo?.openHour);
    const off = (data.basicInfo?.offdayList ?? []).map((o) => [o.weekAndNo, o.holidayName].filter(Boolean).join(" ")).filter(Boolean).join(", ") || null;
    const open = openNow(hours, now);
    return { menu, hours, openNow: open, offDays: off, statusText: statusOf(hours, open, now) };
  } catch {
    return empty;
  }
}

const cache = new Map<string, { at: number; data: PlaceMenu }>();
const TTL = 10 * 60_000;

export async function cachedKakaoMenu(placeId: string): Promise<PlaceMenu> {
  const now = Date.now();
  const hit = cache.get(placeId);
  if (hit && now - hit.at < TTL) {
    // openNow 는 시간이 지나면 틀려지니 캐시 데이터로 다시 계산
    const d = hit.data;
    const re = openNow(d.hours, new Date());
    return { ...d, openNow: re, statusText: statusOf(d.hours, re, new Date()) };
  }
  const data = await crawlKakaoMenu(placeId);
  cache.set(placeId, { at: now, data });
  if (cache.size > 200) for (const [k, v] of cache) if (now - v.at > TTL) cache.delete(k);
  return data;
}
