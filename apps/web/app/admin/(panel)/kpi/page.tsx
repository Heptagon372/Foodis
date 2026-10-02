// 베타 KPI (07 문서 §1): North Star · Hops · 음성 사용률 · 추천 수락률 · 음성 지연 p95 · D7.
// 익명 events(0004) 를 읽어 lib/admin/kpi.ts 로 계산한다. 발표 슬라이드 1장 근거 — 측정 방법은 docs/design/07_KPI_측정_v1.md
import Link from "next/link";
import { requirePage } from "@/lib/admin/auth";
import { computeKpis, KPI_TARGETS, startOfDay } from "@/lib/admin/kpi";
import { loadEvents } from "@/lib/admin/kpi-data";
import { dataStatus } from "@/lib/content";

const TZ = 540; // 한국 시간 기준 하루
const DAY = 86_400_000;
const RANGES = { "7": "최근 7일", "14": "최근 14일", all: "베타 전체" } as const;
type Range = keyof typeof RANGES;
const DOC_URL = "https://github.com/Heptagon372/Foodis/blob/main/docs/design/07_KPI_%EC%B8%A1%EC%A0%95_v1.md";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const sec = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)}초`);
const fix = (v: number | null, d = 1) => (v == null ? "—" : v.toFixed(d));

export default async function KpiPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requirePage("reviewer");
  const q = (await searchParams).range;
  const range: Range = q === "14" || q === "all" ? q : "7";
  const now = Date.now();
  const to = startOfDay(now, TZ) + DAY; // 오늘 끝(자정)까지 — 7일 = 오늘 포함 7일
  const from = range === "all" ? null : to - Number(range) * DAY;

  const [loaded, status] = await Promise.all([loadEvents(from == null ? null : new Date(from), new Date(to)), dataStatus()]);
  if (loaded.error)
    return (
      <div className="space-y-2 rounded-2xl border border-diet-no/30 bg-surface p-5">
        <p className="font-semibold text-diet-no">이벤트를 읽을 수 없어요</p>
        <p className="text-sm">{loaded.error.code === "PGRST205" ? "events 테이블이 없어요. Supabase SQL Editor 에서 supabase/migrations/0004_events.sql 을 실행하세요." : loaded.error.message}</p>
      </div>
    );
  const k = computeKpis(loaded.rows, { from, to, now, tzOffsetMin: TZ });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <Link key={r} href={`/admin/kpi?range=${r}`} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${range === r ? "bg-green-800 text-ivory" : "bg-surface"}`}>
            {RANGES[r]}
          </Link>
        ))}
        <span className="ml-auto text-caption text-muted">
          {k.daily[0]?.day ?? "—"} ~ {k.daily.at(-1)?.day ?? "—"} (한국 시간) · 활성 사용자 {k.activeUsers}명 · 세션 {k.sessions} · 이벤트 {k.events.toLocaleString("ko-KR")}건
        </span>
      </div>

      {!status.live && (
        <p className="rounded-xl bg-diet-warn/15 px-4 py-3 text-sm text-[#7a5a10]">
          앱이 <b>미리보기 샘플</b>로 돌고 있어요 — 이 동안 /api/events 는 이벤트를 받기만 하고 저장하지 않아요 ({status.reason}).
        </p>
      )}
      {loaded.truncated && <p className="rounded-xl bg-diet-warn/15 px-4 py-3 text-sm text-[#7a5a10]">이벤트 {loaded.total.toLocaleString("ko-KR")}건 중 앞쪽 {k.events.toLocaleString("ko-KR")}건만 계산했어요. 기간을 줄여 보세요.</p>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="North Star · 주간 신규 탐험 국가 / 활성 사용자"
          value={k.northStar.value == null ? "—" : `${fix(k.northStar.value)}개국`}
          target={`목표 ${KPI_TARGETS.northStar}개국 이상`}
          met={k.northStar.value == null ? null : k.northStar.value >= KPI_TARGETS.northStar}
          note={`새로 탐험한 나라 ${k.newCountries}개 · ${k.northStar.partial ? "7일 미만 구간" : `${k.northStar.weeks.length}주 평균`}`}
          daily={k.daily.map((d) => d.newCountries)}
          days={k.daily.map((d) => d.day)}
          fmt={(v) => `${v}개국`}
          small={k.activeUsers < 5}
        />
        <KpiCard
          label="탐험 깊이 (Hops) · 상세 → 상세 연속 이동"
          value={fix(k.hops.avg)}
          target={`목표 평균 ${KPI_TARGETS.hops} 이상`}
          met={k.hops.avg == null ? null : k.hops.avg >= KPI_TARGETS.hops}
          note={`상세를 본 세션 ${k.hops.sessions}개 · 최대 ${k.hops.max ?? "—"}`}
          daily={k.daily.map((d) => d.hopsAvg)}
          days={k.daily.map((d) => d.day)}
          targetLine={KPI_TARGETS.hops}
          fmt={(v) => v.toFixed(1)}
          small={k.hops.sessions < 10}
        />
        <KpiCard
          label="음성 사용률 · 음성 질의 / 전체 질의"
          value={pct(k.voice.rate)}
          target={`목표 ${KPI_TARGETS.voiceRate * 100}% 이상`}
          met={k.voice.rate == null ? null : k.voice.rate >= KPI_TARGETS.voiceRate}
          note={`음성 ${k.voice.voice} / 전체 ${k.voice.total}`}
          daily={k.daily.map((d) => d.voiceRate)}
          days={k.daily.map((d) => d.day)}
          targetLine={KPI_TARGETS.voiceRate}
          max={1}
          fmt={(v) => `${Math.round(v * 100)}%`}
          small={k.voice.total < 20}
        />
        <KpiCard
          label="추천 수락률 · 추천 카드 → 상세 진입 또는 좋아요"
          value={pct(k.accept.rate)}
          target={`목표 ${KPI_TARGETS.acceptRate * 100}% 이상`}
          met={k.accept.rate == null ? null : k.accept.rate >= KPI_TARGETS.acceptRate}
          note={`수락 ${k.accept.accepted} / 보여준 카드 ${k.accept.shown}`}
          daily={k.daily.map((d) => d.acceptRate)}
          days={k.daily.map((d) => d.day)}
          targetLine={KPI_TARGETS.acceptRate}
          max={1}
          fmt={(v) => `${Math.round(v * 100)}%`}
          small={k.accept.shown < 20}
        />
        <KpiCard
          label="음성 응답 지연 p95 · 발화 끝 → 첫 음성"
          value={sec(k.latency.firstAudioP95)}
          target={`목표 ${KPI_TARGETS.firstAudioP95Ms / 1000}초 이하`}
          met={k.latency.firstAudioP95 == null ? null : k.latency.firstAudioP95 <= KPI_TARGETS.firstAudioP95Ms}
          note={`음성 질의 ${k.latency.firstAudioN}건 · 참고: 질의→응답 p95 ${sec(k.latency.responseP95)}`}
          daily={k.daily.map((d) => d.firstAudioP95)}
          days={k.daily.map((d) => d.day)}
          targetLine={KPI_TARGETS.firstAudioP95Ms}
          fmt={(v) => `${(v / 1000).toFixed(1)}초`}
          small={k.latency.firstAudioN < 20}
          lowerIsBetter
        />
        <div className="space-y-2 rounded-2xl bg-surface p-4 shadow-sm">
          <p className="text-caption text-muted">사실 오류율 · 평가 셋 기준</p>
          <p className="font-display text-2xl font-semibold text-muted">평가 셋에서 측정</p>
          <p className="text-caption">목표 식이 0% · 기타 3% 이하</p>
          <p className="text-caption text-muted">
            사용자 이벤트가 아니라 고정 질문 셋(lib/foodi/eval)으로 잰다 — <code className="rounded bg-line/60 px-1">pnpm eval:live</code>. 실제 답의 검증 실패는{" "}
            <Link href="/admin/logs?failed=1" className="underline">
              AI 로그
            </Link>
            에서.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <KpiCard
          label="일별 활성 사용자 (익명 브라우저)"
          value={`${k.activeUsers}명`}
          target="베타 모집 20~30명"
          met={null}
          note={`세션 ${k.sessions}개 · 질의 ${k.voice.total}건`}
          daily={k.daily.map((d) => d.active)}
          days={k.daily.map((d) => d.day)}
          fmt={(v) => `${v}명`}
        />
        <KpiCard
          label="D7 재방문 (참고)"
          value={pct(k.d7.rate)}
          target="참고용 — 베타 표본이 작아요"
          met={null}
          note={`7일 지난 사용자 ${k.d7.cohort}명 중 7~13일차 재방문 ${k.d7.retained}명`}
          days={[]}
        />
      </div>

      <Method />
    </div>
  );
}

function KpiCard(p: {
  label: string;
  value: string;
  target: string;
  met: boolean | null;
  note: string;
  daily?: (number | null)[];
  days: string[];
  targetLine?: number;
  max?: number;
  fmt?: (v: number) => string;
  small?: boolean;
  lowerIsBetter?: boolean;
}) {
  const pill =
    p.met == null ? null : p.met ? <span className="rounded-full bg-mint-100 px-2 py-0.5 text-caption font-semibold text-green-800">달성</span> : <span className="rounded-full bg-diet-no/10 px-2 py-0.5 text-caption font-semibold text-diet-no">미달</span>;
  return (
    <div className="space-y-2 rounded-2xl bg-surface p-4 shadow-sm">
      <p className="text-caption text-muted">{p.label}</p>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="font-display text-2xl font-semibold">{p.value}</p>
        {pill}
        {p.small && <span className="rounded-full bg-line/60 px-2 py-0.5 text-caption text-charcoal/70">표본 적음</span>}
      </div>
      <p className="text-caption">{p.target}</p>
      {p.daily && <Bars values={p.daily} days={p.days} target={p.targetLine} max={p.max} fmt={p.fmt} lowerIsBetter={p.lowerIsBetter} />}
      <p className="text-caption text-muted">{p.note}</p>
    </div>
  );
}

/** 일별 막대 (차트 라이브러리 없이 SVG). 값이 없는 날은 바닥 점, 목표선은 점선 */
function Bars({ values, days, target, max, fmt = String, lowerIsBetter }: { values: (number | null)[]; days: string[]; target?: number; max?: number; fmt?: (v: number) => string; lowerIsBetter?: boolean }) {
  const H = 40;
  const W = 8;
  const GAP = 3;
  const top = Math.max(max ?? 0, target ?? 0, ...values.map((v) => v ?? 0)) || 1;
  const width = Math.max(values.length * (W + GAP) - GAP, 1);
  const y = (v: number) => H - (v / top) * H;
  return (
    <svg viewBox={`0 0 ${width} ${H + 2}`} preserveAspectRatio="none" className="h-12 w-full" role="img" aria-label="일별 추이">
      {values.map((v, i) => {
        const good = v != null && target != null && (lowerIsBetter ? v <= target : v >= target);
        return (
          <g key={days[i] ?? i}>
            <title>{`${days[i]?.slice(5) ?? ""} · ${v == null ? "데이터 없음" : fmt(v)}`}</title>
            {v == null ? (
              <rect x={i * (W + GAP)} y={H - 1} width={W} height={1.5} className="fill-line" />
            ) : (
              <rect x={i * (W + GAP)} y={y(v)} width={W} height={Math.max(H - y(v), 1.5)} rx={1.5} className={target == null || good ? "fill-mint-500" : "fill-diet-warn"} />
            )}
          </g>
        );
      })}
      {target != null && <line x1={0} x2={width} y1={y(target)} y2={y(target)} strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" className="stroke-green-800/60" />}
    </svg>
  );
}

function Method() {
  return (
    <section className="space-y-2 rounded-2xl border border-line p-4 text-caption text-charcoal/80">
      <h2 className="text-sm font-semibold text-charcoal">측정 방법</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <b>사용자</b> = 브라우저마다 만든 익명 id(계정과 무관). <b>세션</b> = 30분 무활동이면 새로. Do Not Track·GPC·데모 모드 브라우저는 보내지 않아요.
        </li>
        <li>
          <b>North Star</b>: 기간 시작부터 7일씩 잘라, 주마다 (그 주에 처음 Passport 에 들어온 나라 수 ÷ 그 주 활성 사용자)의 평균. 7일이 안 되는 마지막 조각은 뺍니다.
        </li>
        <li>
          <b>Hops</b>: 한 세션에서 음식 상세를 연달아 연 횟수(상세 수 − 1). 10분 넘게 끊기면 새 줄기, 같은 음식 새로고침은 제외, 세션마다 가장 긴 줄기의 평균.
        </li>
        <li>
          <b>음성 사용률</b>: 푸디 질의(실패 포함) 중 음성으로 한 비율. 추천 질문 칩·&lsquo;다른 거&rsquo; 버튼은 글 질의로 셉니다.
        </li>
        <li>
          <b>추천 수락률</b>: 푸디 답의 카드(세션 안 서로 다른 음식) 중, 보여준 뒤 같은 세션에서 상세로 들어가거나 좋아요를 누른 비율.
        </li>
        <li>
          <b>음성 지연 p95</b>: 음성 질의에서 인식 확정 → 푸디 음성 재생 시작까지(서버 TTS 는 재생 시작, 브라우저 음성은 재생 요청 시각). Whisper 경로는 녹음 업로드·전사 시간이 빠져 있어요.
        </li>
        <li>
          <b>D7</b>: 처음 본 지 7일이 지난 사용자 중 7~13일차에 다시 온 비율. 기간 밖 이벤트는 보지 않아요.
        </li>
      </ul>
      <p>
        이벤트 목록·필드·보관 기간(90일):{" "}
        <a href={DOC_URL} target="_blank" rel="noreferrer" className="underline">
          docs/design/07_KPI_측정_v1.md
        </a>
      </p>
    </section>
  );
}
