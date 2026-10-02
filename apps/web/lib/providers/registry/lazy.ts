export const lazy = <T>(make: () => T) => {
  let v: T | undefined;
  return () => (v ??= make());
};

/** /api/health 에 보이는 제공자 상태 한 줄 (키 값은 절대 넣지 않는다) */
export type ProviderStatus = { id: string; ready: boolean; note?: string };
