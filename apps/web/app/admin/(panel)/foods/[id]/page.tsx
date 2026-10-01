import { notFound } from "next/navigation";
import { FoodEditor } from "@/components/admin/FoodEditor";
import { db } from "@/lib/admin/data";
import { getAdminSession } from "@/lib/admin/auth";
import { DIET_KEYS } from "@/lib/foodi/schema";

export default async function EditFood({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getAdminSession();
  const c = db();
  const [{ data: f }, { data: countries }] = await Promise.all([
    c.from("foods").select("*, sources(field, url, title, data_source_id), reports(id, field, message, status)").eq("id", id).maybeSingle(),
    c.from("countries").select("code, name_ko, flag_emoji").order("code"),
  ]);
  if (!f) notFound();
  const sources = (f.sources ?? []) as { field: string; url: string; title: string | null; data_source_id: string | null }[];
  return (
    <FoodEditor
      id={f.id}
      slug={f.slug}
      verified={f.verified}
      isAuthor={f.created_by === s?.userId}
      role={s?.role ?? null}
      countries={countries ?? []}
      evidence={sources.filter((x) => x.field !== "diet")}
      reports={((f.reports ?? []) as { id: string; field: string; message: string | null; status: string }[]).filter((r) => r.status === "open")}
      initial={{
        name_ko: f.name_ko,
        name_en: f.name_en,
        name_local: f.name_local,
        country_code: f.country_code,
        region_in_country: f.region_in_country,
        origin_note: f.origin_note,
        summary: f.summary ?? "",
        history: f.history,
        culture_story: f.culture_story,
        cooking_method: f.cooking_method,
        course_type: f.course_type,
        taste_tags: f.taste_tags ?? [],
        allergens: f.allergens ?? [],
        diet: Object.fromEntries(DIET_KEYS.map((k) => [k, f[`diet_${k}`]])) as never,
        diet_note: f.diet_note,
        diet_sources: sources.filter((x) => x.field === "diet").map((x) => x.url),
        image_url: f.image_url,
        image_credit: f.image_credit,
      }}
    />
  );
}
