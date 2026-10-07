import { MyTableView } from "@/components/MyTable";
import { getContent } from "@/lib/content";
import { toTableCountry } from "@/lib/table/my-table";

export const metadata = { title: "My Table — FOODIS" };
export const dynamic = "force-dynamic";

// S8 My Table (F-REC-04). 탐험 기록은 브라우저에 있으니 서버는 나라 조회표만 넘기고, 음식 사진은 화면이 /api/foods/table 로 기록한 것만 받아 온다
export default async function MyTablePage() {
  const content = await getContent();
  const countries = await content.listCountries();
  return <MyTableView countries={countries.map(toTableCountry)} preview={content.mode === "preview"} />;
}
