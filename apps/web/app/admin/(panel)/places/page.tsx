// 음식점·혜택 관리 (docs/design/12): 제보·등록 확인 큐 · 혜택/음식점 등록 · 가맹 브랜드 동기화 · 음식점 목록
// 카카오 응답(이름·주소·좌표)은 DB 에 없다(약관) — 목록은 카카오 장소 링크와 우리가 받은 정보만 보여준다.
import { ActionButton } from "@/components/admin/ui";
import { OfferForm, RestaurantForm } from "@/components/admin/PlacesForms";
import { Icon } from "@/components/icons";
import { IconTile } from "@/components/ui";
import { getAdminSession, hasRole } from "@/lib/admin/auth";
import { db } from "@/lib/admin/data";
import { OFFER_LABEL, offerState } from "@/lib/places/offers";

type OfferRow = { id: string; kind: keyof typeof OFFER_LABEL; title: string; detail: string | null; starts_at: string | null; ends_at: string | null; source: "owner" | "admin" | "report"; verified: boolean; created_at: string; restaurants: { kakao_place_id: string; place_url: string | null; name: string | null } | null };
type RestaurantRow = { id: string; kakao_place_id: string; place_url: string | null; name: string | null; info_source: string | null; franchise_brand: string | null; is_franchise: boolean | null; updated_at: string; restaurant_offers: { id: string; verified: boolean }[] };

const SOURCE = { owner: "사장님 등록", admin: "푸디 확인", report: "이용자 제보" } as const;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "");

export default async function PlacesAdmin() {
  const s = await getAdminSession();
  const c = db();
  const [queue, live, restaurants, brandCount, lastSync, stats] = await Promise.all([
    c.from("restaurant_offers").select("id, kind, title, detail, starts_at, ends_at, source, verified, created_at, restaurants(kakao_place_id, place_url, name)").eq("verified", false).order("created_at", { ascending: false }).limit(100),
    c.from("restaurant_offers").select("id, kind, title, detail, starts_at, ends_at, source, verified, created_at, restaurants(kakao_place_id, place_url, name)").eq("verified", true).order("created_at", { ascending: false }).limit(100),
    c.from("restaurants").select("id, kakao_place_id, place_url, name, info_source, franchise_brand, is_franchise, updated_at, restaurant_offers(id, verified)").order("updated_at", { ascending: false }).limit(100),
    c.from("franchise_brands").select("normalized", { count: "exact", head: true }),
    c.from("franchise_brands").select("synced_at, source_updated_at").order("synced_at", { ascending: false }).limit(1),
    c.from("restaurant_rating_stats").select("restaurant_id, avg, count"),
  ]);
  const err = [queue, restaurants].find((r) => r.error)?.error;
  if (err)
    return (
      <div className="space-y-2 rounded-3xl border border-diet-no/30 bg-surface p-5">
        <p className="flex items-center gap-1.5 font-semibold text-diet-no">
          <Icon name="warn" className="size-5" />
          음식점 테이블을 읽을 수 없어요
        </p>
        <p className="text-sm text-ink">{err.code === "PGRST205" ? "Supabase SQL Editor 에서 supabase/migrations/0005_restaurants.sql 을 실행하세요." : err.message}</p>
      </div>
    );
  const q = (queue.data ?? []) as unknown as OfferRow[];
  const l = ((live.data ?? []) as unknown as OfferRow[]).filter((o) => offerState(o) !== "expired");
  const rs = (restaurants.data ?? []) as unknown as RestaurantRow[];
  const rating = new Map(((stats.data ?? []) as { restaurant_id: string; avg: number; count: number }[]).map((r) => [r.restaurant_id, r]));
  const sync = lastSync.data?.[0] as { synced_at: string; source_updated_at: string | null } | undefined;
  const reviewer = hasRole(s, "reviewer");

  return (
    <div className="space-y-8">
      <section className="card flex flex-wrap items-center gap-4 rounded-3xl p-5">
        <IconTile icon="package" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">가맹 브랜드 (공정위 가맹사업 정보공개 · 외식)</p>
          <p className="text-caption text-muted">
            {brandCount.count ?? 0}개 · {sync ? `마지막 동기화 ${new Date(sync.synced_at).toLocaleString("ko-KR")} (기준년도 ${sync.source_updated_at ?? "?"})` : "아직 동기화 안 함 — 그동안 화면에는 가맹 여부를 표시하지 않아요"}
          </p>
        </div>
        {hasRole(s, "admin") && (
          <ActionButton url="/api/admin/places/franchise/sync" tone="primary" confirm="공정위 API 에서 외식 가맹 브랜드 목록을 받아올까요? (1분 정도 걸려요)" done={(d) => `${(d as { brands: number; year: string }).brands}개 브랜드 (${(d as { year: string }).year}년)`}>
            가맹 브랜드 동기화
          </ActionButton>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-h2 font-bold text-ink">확인 대기 {q.length ? `(${q.length})` : ""}</h2>
        <p className="text-caption text-muted">이용자 제보는 확인 전까지 &lsquo;제보 · 확인 전&rsquo; 배지만 보이고 내용은 공개되지 않아요. 가게·공식 채널에서 확인한 뒤 승인하세요. 정보 정정 제보는 반영 후 지우면 돼요.</p>
        {q.map((o) => (
          <OfferItem key={o.id} o={o}>
            {reviewer && (
              <div className="flex gap-2">
                {o.kind !== "info" && (
                  <ActionButton url={`/api/admin/places/offers/${o.id}`} method="PATCH" body={{ verified: true }} tone="primary">
                    <Icon name="check" className="size-4" />
                    확인
                  </ActionButton>
                )}
                <ActionButton url={`/api/admin/places/offers/${o.id}`} method="DELETE" tone="danger" confirm="이 항목을 지울까요?">
                  지우기
                </ActionButton>
              </div>
            )}
          </OfferItem>
        ))}
        {!q.length && <p className="py-4 text-center text-muted">확인할 항목이 없어요.</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-h2 font-bold text-ink">혜택 등록</h2>
        <p className="text-caption text-muted">사장님·공식 채널에서 직접 확인한 것만. 쿠폰·이벤트는 마감일이 꼭 필요해요. 등록한 사람과 다른 검수자가 확인해야 공개돼요.</p>
        <OfferForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-h2 font-bold text-ink">공개 중인 혜택</h2>
        {l.map((o) => (
          <OfferItem key={o.id} o={o}>
            {reviewer && (
              <ActionButton url={`/api/admin/places/offers/${o.id}`} method="PATCH" body={{ verified: false }}>
                공개 취소
              </ActionButton>
            )}
          </OfferItem>
        ))}
        {!l.length && <p className="py-4 text-center text-muted">공개 중인 혜택이 없어요.</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-h2 font-bold text-ink">파트너 음식점 등록</h2>
        <p className="text-caption text-muted">카카오 장소 링크로 묶고, 이름·주소·위치는 사장님에게 받은 값만 넣어요 (카카오 결과 복사 금지 — 약관). 음식 slug 를 넣으면 &lsquo;메뉴 확인됨&rsquo;으로 표시돼요.</p>
        <RestaurantForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-h2 font-bold text-ink">최근 음식점 ({rs.length})</h2>
        <div className="card overflow-x-auto rounded-3xl">
          <table className="w-full text-sm text-ink">
            <thead className="text-left text-caption text-muted">
              <tr className="border-b border-line">
                <th className="px-3 py-2">카카오 장소</th>
                <th className="px-3 py-2">우리가 받은 이름</th>
                <th className="px-3 py-2">가맹</th>
                <th className="px-3 py-2">혜택</th>
                <th className="px-3 py-2">푸디 평점</th>
                <th className="px-3 py-2">갱신</th>
              </tr>
            </thead>
            <tbody>
              {rs.map((r) => {
                const st = rating.get(r.id);
                return (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      <a href={r.place_url ?? `https://place.map.kakao.com/${r.kakao_place_id}`} target="_blank" rel="noreferrer" className="text-leaf underline hover:text-brand">
                        {r.kakao_place_id}
                      </a>
                    </td>
                    <td className="px-3 py-2">{r.name ? `${r.name} · ${r.info_source === "owner" ? "사장님" : "푸디팀"}` : <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2">{r.is_franchise == null ? "—" : r.is_franchise ? `가맹 · ${r.franchise_brand}` : "개인(추정)"}</td>
                    <td className="px-3 py-2">
                      {r.restaurant_offers.filter((o) => o.verified).length} / {r.restaurant_offers.length}
                    </td>
                    <td className="px-3 py-2">{st ? `${Number(st.avg).toFixed(1)} (${st.count})` : "—"}</td>
                    <td className="px-3 py-2 text-caption text-muted">{day(r.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rs.length && <p className="py-6 text-center text-muted">아직 검색된 음식점이 없어요.</p>}
        </div>
      </section>
    </div>
  );
}

function OfferItem({ o, children }: { o: OfferRow; children: React.ReactNode }) {
  const r = o.restaurants;
  return (
    <div className="card flex flex-wrap items-start gap-4 rounded-3xl p-5">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold text-ink">
          <span className="mr-2 rounded-full bg-lime-soft px-2.5 py-0.5 text-caption text-leaf">{OFFER_LABEL[o.kind]}</span>
          {o.title}
          <span className="ml-2 text-caption font-normal text-muted">
            {SOURCE[o.source]} · {day(o.created_at)}
            {o.starts_at || o.ends_at ? ` · ${day(o.starts_at)} ~ ${day(o.ends_at)}` : ""}
          </span>
        </p>
        {o.detail && <p className="text-sm text-ink-soft">{o.detail}</p>}
        {r && (
          <a href={r.place_url ?? `https://place.map.kakao.com/${r.kakao_place_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-caption text-muted underline hover:text-leaf">
            {r.name ?? `카카오 장소 ${r.kakao_place_id}`}
            <Icon name="external" className="size-3.5" />
          </a>
        )}
      </div>
      {children}
    </div>
  );
}
