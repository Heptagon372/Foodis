// Food Journey 지도: 세계 지도(lib/map/world.ts)와 같은 데이터·투영으로 여정 경로를 서버에서 계산한다 → 클라이언트는 문자열·좌표만.
// 나라 사이는 대권(great-circle) 호 — d3 geoPath 는 LineString 의 변을 대권으로 그리고 날짜변경선에서 알아서 끊는다.
import { geoArea, geoCentroid, geoEqualEarth, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry, LineString, MultiPolygon, Polygon } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import atlas from "world-atlas/countries-110m.json";
import { ISO_NUMERIC, MARKER_LONLAT } from "@/lib/map/iso";
import { MAP_ASPECT, type Box } from "@/lib/map/world";

export type JourneyMap = {
  aspect: number;
  box: Box;
  /** 경로 밖 나라들 (화면 근처만, 한 덩어리) */
  land: string;
  /** 여정이 지나는 나라 */
  lit: { code: string; d: string }[];
  /** to = 도착 정류장 번호. 같은 나라 안 이동은 짧은 직선 */
  segs: { to: number; d: string }[];
  /** 정류장 마커 위치 (나라를 지도에서 못 찾으면 null — 타임라인에만) */
  pins: ([number, number] | null)[];
  /** 마커 반지름 (viewBox 단위) — 확대 정도와 상관없이 화면에서 비슷한 크기 */
  r: number;
};

// world.ts 와 반드시 같은 설정 (map.test.ts 가 두 결과의 경로가 같은지 확인한다)
const WIDTH = 960;
/** 한 나라짜리 여정도 주변이 보이게 하는 최소 폭 (전 세계 폭 960 기준) */
const MIN_W = 240;
const round = (n: number) => Math.round(n * 10) / 10;

let base: { features: Feature[]; byId: Map<string, Feature>; projection: ReturnType<typeof geoEqualEarth>; world: [[number, number], [number, number]] } | null = null;

function setup() {
  if (base) return base;
  const topo = atlas as unknown as Topology<{ countries: GeometryCollection }>;
  const features = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry>).features.filter((f) => f.id !== "010");
  const projection = geoEqualEarth().rotate([-11, 0]).fitWidth(WIDTH, { type: "FeatureCollection", features });
  const world = geoPath(projection).bounds({ type: "FeatureCollection", features });
  base = { features, byId: new Map(features.map((f) => [String(f.id), f] as const)), projection, world };
  return base;
}

/** 나라의 대표 [경도, 위도]. 해외 영토가 있는 나라(프랑스·미국 등)는 가장 큰 땅덩이의 중심 — 전체 중심은 바다에 찍힌다 */
export function countryLonLat(code: string): [number, number] | null {
  if (MARKER_LONLAT[code]) return MARKER_LONLAT[code];
  const id = ISO_NUMERIC[code];
  const f = id ? setup().byId.get(id) : undefined;
  if (!f) return null;
  const g = f.geometry as Polygon | MultiPolygon;
  if (g.type !== "MultiPolygon") return geoCentroid(f);
  const parts = g.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }) as Polygon);
  return geoCentroid(parts.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a)));
}

/** 경계 상자를 여백 + 최소 크기 + 화면 비율로 맞춘다. 세계 밖으로 넘치면 안쪽으로 밀어 넣는다 */
function frame([[x0, y0], [x1, y1]]: [[number, number], [number, number]], world: [[number, number], [number, number]]): Box {
  let w = Math.max((x1 - x0) * 1.5, MIN_W);
  let h = Math.max((y1 - y0) * 1.5, MIN_W / MAP_ASPECT);
  if (w / h > MAP_ASPECT) h = w / MAP_ASPECT;
  else w = h * MAP_ASPECT;
  const [[wx0, wy0], [wx1, wy1]] = world;
  const slide = (c: number, size: number, lo: number, hi: number) => (size >= hi - lo ? (lo + hi) / 2 : Math.min(Math.max(c, lo + size / 2), hi - size / 2));
  const cx = slide((x0 + x1) / 2, w, wx0, wx1);
  const cy = slide((y0 + y1) / 2, h, wy0, wy1);
  return [round(cx - w / 2), round(cy - h / 2), round(w), round(h)];
}

/** stops: 정류장마다 나라 코드와 출발 정류장 번호(출발지는 null) */
export function buildJourneyMap(stops: { country: string; from: number | null }[]): JourneyMap {
  const { features, projection, world } = setup();
  const path = geoPath(projection).digits(1);
  const lonlat = stops.map((s) => countryLonLat(s.country));
  const center = lonlat.map((ll) => (ll ? (projection(ll) as [number, number] | null) : null));

  // 1) 화면 범위: 정류장 + 대권 호 전체 (호는 위로 휘어 나가므로 끝점만으로는 모자란다)
  const arcs = stops.map((s, i) => {
    const a = s.from === null ? null : lonlat[s.from];
    const b = lonlat[i];
    if (!a || !b || s.country === stops[s.from!].country) return null;
    return { type: "LineString", coordinates: [a, b] } satisfies LineString;
  });
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of center) {
    if (!p) continue;
    xs.push(p[0]);
    ys.push(p[1]);
  }
  for (const g of arcs) {
    if (!g) continue;
    const [[ax, ay], [bx, by]] = path.bounds(g);
    xs.push(ax, bx);
    ys.push(ay, by);
  }
  const box: Box = xs.length
    ? frame(
        [
          [Math.min(...xs), Math.min(...ys)],
          [Math.max(...xs), Math.max(...ys)],
        ],
        world,
      )
    : frame(world, world);
  const r = round(box[2] * 0.032);

  // 2) 같은 나라에 정류장이 여럿이면 중심 둘레에 고르게 벌려 겹치지 않게
  const pins: ([number, number] | null)[] = center.map((p) => (p ? [round(p[0]), round(p[1])] : null));
  const groups = new Map<string, number[]>();
  stops.forEach((s, i) => pins[i] && groups.set(s.country, [...(groups.get(s.country) ?? []), i]));
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    idx.forEach((i, k) => {
      const t = (2 * Math.PI * k) / idx.length - Math.PI / 2;
      const [x, y] = pins[i]!;
      pins[i] = [round(x + Math.cos(t) * r * 1.4), round(y + Math.sin(t) * r * 1.4)];
    });
  }

  const segs: JourneyMap["segs"] = [];
  stops.forEach((s, i) => {
    if (s.from === null) return;
    const g = arcs[i];
    const a = pins[s.from];
    const b = pins[i];
    const d = g ? path(g) : a && b ? `M${a[0]} ${a[1]}L${b[0]} ${b[1]}` : null;
    if (d) segs.push({ to: i, d });
  });

  // 3) 바탕 지도: 화면 근처 나라만 보내 페이로드를 줄인다
  const codes = new Set(stops.map((s) => s.country));
  const litIds = new Map([...codes].flatMap((c) => (ISO_NUMERIC[c] ? [[ISO_NUMERIC[c], c] as const] : [])));
  const [bx, by, bw, bh] = box;
  const near = (f: Feature) => {
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    return x1 >= bx - bw * 0.1 && x0 <= bx + bw * 1.1 && y1 >= by - bh * 0.1 && y0 <= by + bh * 1.1;
  };
  const lit: JourneyMap["lit"] = [];
  let land = "";
  for (const f of features) {
    const code = litIds.get(String(f.id));
    if (code) lit.push({ code, d: path(f) ?? "" });
    else if (near(f)) land += path(f) ?? "";
  }
  return { aspect: MAP_ASPECT, box, land, lit, segs, pins, r };
}

/** 테스트용: 세계 지도 쪽과 투영이 같은지 비교하려고 한 나라 경로를 같은 방식으로 */
export function countryPath(code: string): string {
  const { byId, projection } = setup();
  const f = byId.get(ISO_NUMERIC[code]);
  return f ? (geoPath(projection).digits(1)(f) ?? "") : "";
}
