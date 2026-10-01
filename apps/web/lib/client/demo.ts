"use client";
// 데모 모드 클라이언트: 팩·음성·화면을 발표 기기 브라우저(Cache Storage)에 저장하고, 질문이 오면 팩에서 먼저/대신 답한다.
// 캐시 이름은 public/sw.js 와 같아야 한다.
import { matchDemo, type DemoPack } from "@/lib/demo/pack";
import { passportAnswer, passportSummary } from "@/lib/foodi/passport";
import type { AskResponse } from "@/lib/foodi/schema";
import { exploredCountries, getState } from "./passport";

export const DEMO_CACHE = "foodis-demo-v1";
export const PAGES_CACHE = "foodis-pages-v1";
const PACK_KEY = "/__demo/pack.json";
const audioKey = (id: string) => `/__demo/audio/${id}.mp3`;
const FLAG = "foodis:demo-mode";

const hasCaches = () => typeof window !== "undefined" && "caches" in window;

export function isDemoMode(): boolean {
  try {
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}
export function setDemoMode(on: boolean) {
  try {
    if (on) localStorage.setItem(FLAG, "1");
    else localStorage.removeItem(FLAG);
  } catch {
    /* 무시 */
  }
}

let packMemo: DemoPack | null | undefined;

export async function loadPack(): Promise<DemoPack | null> {
  if (packMemo !== undefined) return packMemo;
  if (!hasCaches()) return (packMemo = null);
  const res = await (await caches.open(DEMO_CACHE)).match(PACK_KEY);
  packMemo = res ? ((await res.json()) as DemoPack) : null;
  return packMemo;
}

export async function savePack(pack: DemoPack) {
  if (!hasCaches()) throw new Error("이 브라우저는 Cache Storage 를 지원하지 않아요 (https 또는 localhost 필요)");
  await (await caches.open(DEMO_CACHE)).put(PACK_KEY, new Response(JSON.stringify(pack), { headers: { "content-type": "application/json" } }));
  packMemo = pack;
}

/** 팩에서 답 찾기. Passport 질문은 녹화된 숫자 대신 이 기기의 실제 기록으로 다시 계산한다 */
export async function answerFromPack(text: string, contextFoodId?: string): Promise<{ response: AskResponse; itemId: string } | null> {
  const pack = await loadPack();
  const item = pack ? matchDemo(pack, text, contextFoodId) : null;
  if (!pack || !item) return null;
  if (item.response.intent !== "passport_status") return { response: item.response, itemId: item.id };
  const s = getState();
  const p = passportSummary({ exploredCountries: exploredCountries(s), exploredFoodIds: Object.keys(s.entries) } as never, pack.countries);
  const out = passportAnswer(p);
  return { response: { ...item.response, speech: out.speech, follow_ups: out.follow_ups, passport: p }, itemId: item.id };
}

export async function cachedAudio(itemId: string): Promise<Blob | null> {
  if (!hasCaches()) return null;
  const res = await (await caches.open(DEMO_CACHE)).match(audioKey(itemId));
  return res ? res.blob() : null;
}

/** 서버 TTS 로 10문항 음성을 미리 만들어 저장 (TTS 키가 있어야 한다). 실패한 문항은 현장에서 브라우저 음성으로 */
export async function warmAudio(pack: DemoPack, onProgress: (done: number, ok: number) => void): Promise<number> {
  const cache = await caches.open(DEMO_CACHE);
  let ok = 0;
  for (const [i, item] of pack.items.entries()) {
    const res = await fetch("/api/foodi/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: item.response.speech }) }).catch(() => null);
    if (res?.ok) {
      await cache.put(audioKey(item.id), new Response(await res.blob(), { headers: { "content-type": "audio/mpeg" } }));
      ok++;
    }
    onProgress(i + 1, ok);
  }
  return ok;
}

export async function audioCount(pack: DemoPack): Promise<number> {
  const cache = await caches.open(DEMO_CACHE);
  const hits = await Promise.all(pack.items.map((i) => cache.match(audioKey(i.id))));
  return hits.filter(Boolean).length;
}

/** 데모에서 열 화면(HTML)과 그 화면이 쓰는 JS·CSS 를 미리 받아 둔다 → 서비스 워커가 오프라인에서 꺼내 준다 */
export async function precachePages(pack: DemoPack, onProgress: (done: number, total: number) => void): Promise<number> {
  const countries = new Set(pack.items.flatMap((i) => i.response.cards.map((c) => c.country.code)));
  const urls = ["/", "/passport", "/intro", "/onboarding", ...pack.food_slugs.map((s) => `/food/${s}`), ...[...countries].map((c) => `/country/${c}`)];
  const cache = await caches.open(PAGES_CACHE);
  const assets = new Set<string>();
  let ok = 0;
  for (const [i, url] of urls.entries()) {
    const res = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (res?.ok) {
      const html = await res.clone().text();
      for (const m of html.matchAll(/["'](\/_next\/static\/[^"'\s]+)["']/g)) assets.add(m[1]);
      await cache.put(url, res);
      ok++;
    }
    onProgress(i + 1, urls.length);
  }
  // 정적 자산은 서비스 워커를 거쳐 받으면서 static 캐시에 쌓인다
  await Promise.all([...assets].map((a) => fetch(a).catch(() => null)));
  return ok;
}

export async function cachedPageCount(): Promise<number> {
  if (!hasCaches()) return 0;
  return (await (await caches.open(PAGES_CACHE)).keys()).length;
}
