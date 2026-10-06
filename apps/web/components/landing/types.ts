// 데스크톱 랜딩에 쓰는 사이트 숫자 — 모두 서버(app/page.tsx)에서 실제 데이터·코드 상수로 계산한다 (지어낸 숫자 금지)
export type SiteFacts = {
  countries: number;
  foods: number;
  continents: number;
  channels: number;
  diets: number;
  allergens: number;
  guards: number;
  evalCases: number;
  flags: { code: string; flag: string; name: string }[];
};
