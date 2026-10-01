import { PassportView } from "@/components/PassportView";
import { getContent } from "@/lib/content";

export const metadata = { title: "Passport — FOODIS" };
export const dynamic = "force-dynamic";

// S5 Passport (05 문서 §6)
export default async function PassportPage() {
  const content = getContent();
  return <PassportView countries={await content.listCountries()} preview={content.mode === "preview"} />;
}
