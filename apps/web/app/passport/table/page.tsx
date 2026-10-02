import { MyTableView } from "@/components/MyTable";
import { getContent } from "@/lib/content";
import { toTableCountry, toTableFood } from "@/lib/table/my-table";

export const metadata = { title: "My Table — FOODIS" };
export const dynamic = "force-dynamic";

// S8 My Table (F-REC-04). 탐험 기록은 브라우저에 있으니 서버는 사진·국가색 조회표만 넘긴다
export default async function MyTablePage() {
  const content = await getContent();
  const [foods, countries] = await Promise.all([content.listFoods(), content.listCountries()]);
  return <MyTableView foods={foods.map(toTableFood)} countries={countries.map(toTableCountry)} preview={content.mode === "preview"} />;
}
