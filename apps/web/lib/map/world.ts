// 세계 지도 (F-EXP-05) SVG 경로를 서버에서 미리 계산한다 → 클라이언트는 path 문자열만 받는다 (d3·TopoJSON 은 번들에 안 들어감).
// 데이터: Natural Earth 1:110m (world-atlas, 퍼블릭 도메인). 작은 나라는 이 해상도에 폴리곤이 없어 점 마커로 대신한다.
import { geoEqualEarth, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import atlas from "world-atlas/countries-110m.json";
import { CONTINENT_BOX, ISO_NUMERIC, MARKER_LONLAT } from "./iso";

export type Box = [number, number, number, number]; // SVG viewBox: x y w h
/** d 가 비어 있으면 폴리곤 없이 점만 (dot) 그린다. 폴리곤이 너무 작은 나라도 탭하기 쉽게 dot 을 함께 준다 */
export type MapShape = { code: string; d: string; dot?: [number, number] };
export type WorldMap = { aspect: number; others: string; shapes: MapShape[]; views: Record<string, Box> };

const WIDTH = 960;
/** 지도 영역 가로:세로 — 모바일 한 화면에 지도 + 하단 카드가 같이 보이게 */
export const MAP_ASPECT = 4 / 3;
/** 이보다 작은 폴리곤(투영 후 px², 폭 960 기준)은 손가락으로 누르기 어려워 점을 덧붙인다 */
const TINY_AREA = 30;

const round = (n: number) => Math.round(n * 10) / 10;

/** 경계 상자를 화면 비율에 맞춰 가운데 정렬로 넓히고 여백을 준다 (preserveAspectRatio 와 같은 결과를 viewBox 애니메이션에서도) */
function fit([[x0, y0], [x1, y1]]: [[number, number], [number, number]], pad = 0.04): Box {
  let w = (x1 - x0) * (1 + pad * 2);
  let h = (y1 - y0) * (1 + pad * 2);
  if (w / h > MAP_ASPECT) h = w / MAP_ASPECT;
  else w = h * MAP_ASPECT;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return [round(cx - w / 2), round(cy - h / 2), round(w), round(h)];
}

let cache: WorldMap | null = null;

export function buildWorldMap(): WorldMap {
  if (cache) return cache;
  const topo = atlas as unknown as Topology<{ countries: GeometryCollection }>;
  const all = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry>).features.filter((f) => f.id !== "010"); // 남극 제외 — 화면만 차지한다
  const world: FeatureCollection = { type: "FeatureCollection", features: all };
  // Equal Earth: 면적이 고르게 보여 아프리카·남미가 작아지지 않는다. 중심을 동경 11°로 돌려 사모아·통가·피지가 오른쪽 끝에 함께 모이게
  const projection = geoEqualEarth().rotate([-11, 0]).fitWidth(WIDTH, world);
  const path = geoPath(projection).digits(1);

  const byId = new Map(all.map((f) => [String(f.id), f] as const));
  const ours = new Set(Object.values(ISO_NUMERIC));
  const others = all.filter((f) => !ours.has(String(f.id))).map((f) => path(f) ?? "").join("");

  const shapes: MapShape[] = Object.entries(ISO_NUMERIC).map(([code, id]) => {
    const f: Feature | undefined = byId.get(id);
    if (!f) {
      const ll = MARKER_LONLAT[code];
      const p = ll && projection(ll);
      return { code, d: "", dot: p ? [round(p[0]), round(p[1])] : undefined };
    }
    const d = path(f) ?? "";
    if (path.area(f) >= TINY_AREA) return { code, d };
    const [cx, cy] = path.centroid(f);
    return { code, d, dot: [round(cx), round(cy)] };
  });

  // 대륙 칩: 경위도 상자 테두리를 따라 점을 찍어 투영한 경계 (Equal Earth 는 경선이 휘어 꼭짓점 4개만으로는 모자란다)
  // 전체 보기는 사모아 점(날짜변경선 너머 오른쪽 끝)까지 들어오게 점 좌표도 경계에 넣는다
  const [[wx0, wy0], [wx1, wy1]] = path.bounds(world);
  const dots = shapes.flatMap((s) => (s.dot ? [s.dot] : []));
  const views: Record<string, Box> = {
    all: fit(
      [
        [Math.min(wx0, ...dots.map((p) => p[0])), Math.min(wy0, ...dots.map((p) => p[1]))],
        [Math.max(wx1, ...dots.map((p) => p[0])), Math.max(wy1, ...dots.map((p) => p[1]))],
      ],
      0.01,
    ),
  };
  for (const [k, [w, s, e, n]] of Object.entries(CONTINENT_BOX)) {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 20; i++) {
      const lon = w + ((e - w) * i) / 20;
      const lat = s + ((n - s) * i) / 20;
      pts.push([lon, s], [lon, n], [w, lat], [e, lat]);
    }
    const xy = pts.map((p) => projection(p)).filter((p): p is [number, number] => !!p);
    const xs = xy.map((p) => p[0]);
    const ys = xy.map((p) => p[1]);
    views[k] = fit([
      [Math.min(...xs), Math.min(...ys)],
      [Math.max(...xs), Math.max(...ys)],
    ]);
  }

  cache = { aspect: MAP_ASPECT, others, shapes, views };
  return cache;
}
