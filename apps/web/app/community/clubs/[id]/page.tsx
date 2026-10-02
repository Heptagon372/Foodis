import type { Metadata } from "next";
import { ClubHome } from "@/components/community/ClubHome";
import { CATEGORY } from "@/lib/community/categories";
import { getStore } from "@/lib/community/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

// 공유 링크 미리보기용 메타만 서버에서. 화면(가입 여부 등)은 클라이언트가 불러온다
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = (await params).id;
  const club = /^[A-Za-z0-9-]{1,64}$/.test(id) ? await (await getStore()).getClub(id).catch(() => null) : null;
  if (!club) return { title: "모임 — FOODIS" };
  return {
    title: `${club.name} — ${CATEGORY[club.topic].label} 모임 · FOODIS`,
    description: club.description.slice(0, 120),
    openGraph: { title: club.name, description: club.description.slice(0, 120), images: club.cover?.url.startsWith("http") ? [club.cover.url] : undefined },
  };
}

export default async function ClubPage({ params }: Props) {
  return <ClubHome id={(await params).id} />;
}
