// 콘텐츠 목록 서버 캐시. 음식 10,000여 개(약 8MB)를 홈·지도·맛집탐방·라디오·커뮤니티가 요청마다 다시 받아 오지 않게
// 한 프로세스 안에서 5분간 재사용한다. 같은 순간 들어온 요청은 진행 중인 Promise 를 함께 기다린다(중복 조회 없음).
// 어드민이 음식·나라를 고치면 invalidateContent() 로 즉시 비운다.
import "server-only";
import { invalidateFoodIndex } from "@/lib/db/foodis-repo";
import type { ContentSource } from "./types";

const TTL_MS = 5 * 60_000;

type Entry = { at: number; value: Promise<unknown> };
const store = new Map<string, Entry>();

function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { at: Date.now(), value });
  // 실패한 조회는 캐시에 남기지 않는다 (다음 요청이 다시 시도)
  value.catch(() => {
    if (store.get(key)?.value === value) store.delete(key);
  });
  return value;
}

/** 목록 조회(listFoods · listCountries · countFoods)만 캐시한다. 단건 조회는 그대로 통과 */
export function cachedContent(src: ContentSource): ContentSource {
  return {
    ...src,
    listFoods: () => memo("foods", () => src.listFoods()),
    listCountries: () => memo("countries", () => src.listCountries()),
    countFoods: () => memo("count", () => src.countFoods()),
  };
}

/** 어드민 쓰기(음식 추가·수정·삭제·검수·가져오기·나라 동기화) 뒤에 호출 — 푸디 검색 색인(lib/db/foodis-repo, 10분)도 함께 비운다 */
export const invalidateContent = () => {
  store.clear();
  invalidateFoodIndex();
};
