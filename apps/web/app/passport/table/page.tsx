import { MyTableView } from "@/components/MyTable";
import { getContent } from "@/lib/content";
import { toTableCountry } from "@/lib/table/my-table";

export const metadata = { title: "My Table — FOODIS" };
export const dynamic = "force-dynamic";

// S8 My Table (F-REC-04). 탐험 기록은 브라우저에 있으니 서버는 국가 조회표만 넘기고,
// 접시 사진·국가색은 화면이 기록에 있는 음식만 /api/foods/table 로 묻는다 (1만 개 조회표를 통째로 넣던 4MB → 수 KB)
export default async function MyTablePage() {
  const content = await getContent();
  const countries = await content.listCountries();
  return <MyTableView countries={countries.map(toTableCountry)} preview={content.mode === "preview"} />;
}
