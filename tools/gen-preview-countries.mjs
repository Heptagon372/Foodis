// foodis-data/data/seed/countries.csv → apps/web/lib/preview/countries.ts (미리보기 모드의 국가 목록)
// 시드를 바꾸면: node tools/gen-preview-countries.mjs
import { readFileSync, writeFileSync } from "node:fs";

const csv = readFileSync(new URL("../foodis-data/data/seed/countries.csv", import.meta.url), "utf8").trim().split(/\r?\n/);
const head = csv[0].split(",");
const rows = csv.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [head[i], v])));
const out = `// foodis-data/data/seed/countries.csv 에서 생성 (tools/gen-preview-countries.mjs). 시드가 바뀌면 다시 생성.
import type { Country } from "@/lib/content/types";

export const PREVIEW_COUNTRIES: Country[] = ${JSON.stringify(rows, null, 2)};
`;
writeFileSync(new URL("../apps/web/lib/preview/countries.ts", import.meta.url), out);
console.log(`${rows.length}개국 → apps/web/lib/preview/countries.ts`);
