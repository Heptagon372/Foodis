import type { Metadata } from "next";
import { PostDetail } from "@/components/community/PostDetail";
import { CATEGORY } from "@/lib/community/categories";
import { getStore, toCommentView, toViews, type Viewer } from "@/lib/community/server";
import type { PostPage } from "@/lib/client/community";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

// 서버에서 먼저 그린다 (공유 링크 미리보기 · 첫 화면). 내 상태(따봉·투표)는 클라이언트가 마운트 뒤에 붙인다
const NOBODY: Viewer = { key: null, userId: null, anonId: null, name: "", canWrite: false };

async function load(id: string): Promise<PostPage | null> {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return null;
  try {
    const store = await getStore();
    const row = await store.getPost(id);
    if (!row) return null;
    const [[post], comments] = await Promise.all([toViews(store, [row], NOBODY), store.listComments(id)]);
    return { post, comments: comments.map((c) => toCommentView(c, NOBODY)), mode: store.mode, can_write: false };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).id);
  if (!page) return { title: "커뮤니티 — FOODIS" };
  const p = page.post;
  return {
    title: `${p.title} — ${CATEGORY[p.category].label} · FOODIS`,
    description: p.body.slice(0, 120),
    openGraph: { title: p.title, description: p.body.slice(0, 120), images: p.photos[0]?.url.startsWith("http") ? [p.photos[0].url] : undefined },
  };
}

export default async function PostPage({ params }: Props) {
  const id = (await params).id;
  return <PostDetail id={id} initial={await load(id)} />;
}
