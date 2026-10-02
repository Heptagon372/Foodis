"use client";
// 모임 홈 (/community/clubs/:id): 표지 · 소개 · 회원/글 수 · 가입/탈퇴 → 모임 안 글 목록 (최신 순). 글쓰기는 가입한 사람만
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, bump, deleteClub, fetchClub, fetchFeed, toggleClub } from "@/lib/client/community";
import { CATEGORY } from "@/lib/community/categories";
import type { ClubView, PostView } from "@/lib/community/types";
import { Icon } from "../icons";
import { TopBar } from "../TopBar";
import { btn } from "../ui";
import { ClubCover, RisingPill } from "./ClubCard";
import { LoginPrompt, timeAgo } from "./parts";
import { PostCard } from "./PostCard";

export function ClubHome({ id }: { id: string }) {
  const router = useRouter();
  const [club, setClub] = useState<ClubView | null>(null);
  const [missing, setMissing] = useState(false);
  const [posts, setPosts] = useState<PostView[] | null>(null);
  const [login, setLogin] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchClub(id).then(
      (r) => {
        if (!alive) return;
        setClub(r.club);
        bump(r.club.topic, "view");
      },
      (e) => alive && e instanceof ApiError && e.status === 404 && setMissing(true),
    );
    fetchFeed("all", "latest", 0, id).then((r) => alive && setPosts(r.posts), () => alive && setPosts([]));
    return () => {
      alive = false;
    };
  }, [id]);

  if (!club) {
    return (
      <main className="space-y-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:pt-8">
        <TopBar back={{ href: "/community?tab=clubs", label: "모임" }} />
        {missing ? (
          <div className="card space-y-3 rounded-3xl p-6 text-center">
            <p className="text-sm text-ink-soft">모임을 찾을 수 없어요. 없어졌거나 가려진 모임이에요.</p>
            <Link href="/community?tab=clubs" className={btn("primary", "sm")}>
              모임 목록으로
            </Link>
          </div>
        ) : (
          <div className="h-64 animate-pulse rounded-3xl bg-sunken/70" aria-busy />
        )}
      </main>
    );
  }

  const join = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await toggleClub(club);
      setClub({ ...club, joined: r.joined, member_count: r.member_count });
      setNote(r.joined ? `${club.name}에 가입했어요! 첫 인사를 남겨 보세요.` : "모임에서 나왔어요.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setLogin(e.message);
      else setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(`'${club.name}' 모임을 없앨까요? 모임 안의 글도 모두 사라져요.`)) return;
    try {
      await deleteClub(club.id);
      router.push("/community?tab=clubs");
    } catch (e) {
      setNote((e as Error).message);
    }
  };

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:pt-8">
      <TopBar back={{ href: "/community?tab=clubs", label: "모임" }} />

      <header className="card overflow-hidden rounded-[28px]">
        <div className="relative">
          <ClubCover club={club} className="h-40 w-full sm:h-52" />
          <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" aria-hidden />
          <div className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-3 text-white">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-lime">
                <Icon name={CATEGORY[club.topic].icon} className="size-3.5" />
                {CATEGORY[club.topic].label} 모임
                {club.rising && <RisingPill />}
              </p>
              <h1 className="truncate text-h1 font-bold">{club.name}</h1>
            </div>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <p className="whitespace-pre-wrap text-sm text-ink">{club.description}</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
            <span className="inline-flex items-center gap-1">
              <Icon name="users" className="size-4" />
              회원 {club.member_count}명
            </span>
            <span className="inline-flex items-center gap-1">
              <Icon name="message" className="size-4" />글 {club.post_count}
            </span>
            <span>운영 {club.owner_name}</span>
            <span>{timeAgo(club.created_at)} 개설</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {club.joined ? (
              <Link href={`/community/write?club=${club.id}`} className={btn("lime", "sm")}>
                <Icon name="edit" className="size-4" />
                모임에 글쓰기
              </Link>
            ) : (
              <button type="button" onClick={join} disabled={busy} className={btn("primary", "sm")}>
                <Icon name="plus" className="size-4" />
                모임 가입하기
              </button>
            )}
            {club.joined && !club.mine && (
              <button type="button" onClick={join} disabled={busy} className={btn("ghost", "sm")}>
                탈퇴
              </button>
            )}
            {club.mine && (
              <button type="button" onClick={remove} className={btn("ghost", "sm")}>
                <Icon name="trash" className="size-4" />
                모임 없애기
              </button>
            )}
          </div>
        </div>
      </header>

      {login && <LoginPrompt message={login} onClose={() => setLogin(null)} />}
      {note && (
        <p role="status" className="rounded-2xl bg-sunken px-3.5 py-2.5 text-sm text-ink-soft">
          {note}
        </p>
      )}

      <section className="space-y-3 pb-6" aria-label="모임 글">
        <h2 className="text-title font-bold text-ink">모임 글</h2>
        {!posts ? (
          <div className="h-40 animate-pulse rounded-3xl bg-sunken/70" />
        ) : posts.length === 0 ? (
          <div className="card space-y-2 rounded-3xl p-6 text-center">
            <p className="text-sm text-ink-soft">{club.joined ? "첫 글로 인사하거나 정모 일정을 올려 보세요." : "가입하면 이 모임에 글을 쓸 수 있어요."}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {posts.map((p) => (
              <li key={p.id}>
                <PostCard post={p} onLoginNeeded={setLogin} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
