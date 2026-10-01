import { FoodEditor } from "@/components/admin/FoodEditor";
import { db } from "@/lib/admin/data";
import { getAdminSession } from "@/lib/admin/auth";

export default async function NewFood() {
  const s = await getAdminSession();
  const { data: countries } = await db().from("countries").select("code, name_ko, flag_emoji").order("code");
  return (
    <FoodEditor
      role={s?.role ?? null}
      countries={countries ?? []}
      evidence={[]}
      reports={[]}
      initial={{
        name_ko: "",
        name_en: "",
        country_code: countries?.[0]?.code ?? "KR",
        summary: "",
        taste_tags: [],
        allergens: [],
        diet: { vegan: "unknown", vegetarian: "unknown", halal: "unknown", gluten_free: "unknown", dairy_free: "unknown" },
        diet_sources: [],
      }}
    />
  );
}
