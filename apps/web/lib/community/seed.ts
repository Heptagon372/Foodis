// 미리보기 샘플: 키·마이그레이션 전에도 커뮤니티가 빈 화면이 아니게 (발표·개발용). 운영 DB 에는 넣지 않는다.
// 모두 지어낸 예시 글이라 화면에 "샘플" 표시가 붙는다 (작성자 이름 끝 · 샘플).
import type { CategoryKey } from "./categories";
import type { MemorySeed } from "./store";
import type { ClubRow, Photo, Poll, PostRow, Signal, SignalKind } from "./types";

type SeedPost = {
  id: string;
  club?: string;
  category: CategoryKey;
  author: string;
  title: string;
  body: string;
  hoursAgo: number;
  place?: string;
  meetInHours?: number;
  capacity?: number;
  photo?: string; // 음식 slug → 미리보기 사진
  poll?: Poll & { votes: number[] };
  foods?: string[];
  likes: number;
  joins?: number;
};

const POSTS: SeedPost[] = [
  { id: "seed-buddy-1", category: "buddy", author: "민지", title: "오늘 저녁 쌀국수 같이 드실 분 🍜", body: "학교 앞 베트남 식당 가보고 싶은데 혼자 가기 애매해서요. 7시쯤 정문에서 만나요! 분짜도 나눠 먹어요.", hoursAgo: 2, place: "성공회대 정문", meetInHours: 5, capacity: 3, foods: ["pho", "bun-cha"], likes: 6, joins: 1 },
  { id: "seed-halal-1", category: "halal", author: "Aisha", title: "구로·온수 근처 할랄 식당 정리해요", body: "유학생 친구들이랑 가본 곳 위주로 모았어요. 케밥, 비리야니 되는 곳이 생각보다 많아요. 추가로 아시는 곳 댓글 부탁드려요!", hoursAgo: 5, place: "구로디지털단지역", photo: "biryani", foods: ["biryani", "doner-kebab"], likes: 21 },
  { id: "seed-veg-1", category: "vegetarian", author: "초록", title: "팔라펠 vs 후무스, 비건 점심으로 뭐가 더 든든할까요?", body: "요즘 비건 도전 중이에요. 중동 음식이 비건 친화적이라던데 직접 드셔보신 분들 의견 궁금해요.", hoursAgo: 9, photo: "falafel", foods: ["falafel", "hummus"], poll: { question: "점심 한 끼로 더 든든한 건?", options: ["팔라펠 랩", "후무스 플레이트", "둘 다 시킨다"], votes: [14, 6, 11] }, likes: 13 },
  { id: "seed-diet-1", category: "diet", author: "헬린이", title: "다이어트 중 먹어도 덜 미안한 세계 음식", body: "그릭 샐러드, 고이꾸온(월남쌈), 미소시루… 칼로리 낮고 맛있는 거 더 추천해 주세요. 매주 하나씩 도전 중!", hoursAgo: 20, photo: "greek-salad", foods: ["greek-salad", "goi-cuon", "miso-soup"], likes: 17 },
  { id: "seed-collab-1", category: "collab", author: "퓨전셰프", title: "김치 × 타코 콜라보 해봤어요", body: "김치볶음을 또띠아에 올리고 고수 살짝. 생각보다 너무 잘 어울려요. 다음엔 불고기 반미 도전합니다.", hoursAgo: 28, photo: "kimchi", foods: ["kimchi", "bulgogi", "banh-mi"], poll: { question: "다음 콜라보는?", options: ["불고기 반미", "마라 떡볶이", "된장 리소토"], votes: [9, 12, 4] }, likes: 24 },
  { id: "seed-japanese-1", category: "japanese", author: "라멘덕후", title: "돈코츠 라멘 국물 진한 집 찾아요", body: "홍대·합정 쪽에서 국물 진하고 면 꼬들한 라멘집 아시는 분? 이번 주말에 순례 갑니다.", hoursAgo: 33, place: "합정역", photo: "ramen", foods: ["ramen"], likes: 8 },
  { id: "seed-meat-1", category: "meat", author: "고기러버", title: "샤슬릭 맛집 원정대 모집(?)", body: "우즈베키스탄 샤슬릭에 플롭까지 먹으러 동대문 가실 분! 고기 좋아하시면 누구나 환영.", hoursAgo: 40, place: "동대문역사문화공원역", photo: "shashlik", foods: ["shashlik", "plov"], likes: 11 },
  { id: "seed-chinese-1", category: "chinese", author: "마라중독", title: "훠궈 소스 조합 공유합니다", body: "마장(참깨장) 2 + 다진 마늘 1 + 고수 + 굴소스 약간. 이게 근본이에요. 여러분 조합도 알려주세요.", hoursAgo: 52, photo: "hot-pot", foods: ["hot-pot"], poll: { question: "훠궈 육수 취향은?", options: ["홍탕(매운)", "백탕(맑은)", "반반 원앙"], votes: [18, 5, 22] }, likes: 15 },
  { id: "seed-korean-1", category: "korean", author: "Tom", title: "외국인 친구에게 처음 소개할 한식, 뭐가 좋을까요?", body: "다음 주에 독일 친구가 놀러 와요. 맵지 않고 한국스러운 음식으로 비빔밥 vs 불고기 고민 중.", hoursAgo: 60, photo: "bibimbap", foods: ["bibimbap", "bulgogi"], poll: { question: "첫 한식으로 추천!", options: ["비빔밥", "불고기", "떡볶이(용기)"], votes: [16, 13, 3] }, likes: 19 },
  { id: "seed-western-1", category: "western", author: "파스타공방", title: "진짜 카르보나라는 크림을 안 넣어요", body: "달걀노른자 + 페코리노 + 관찰레(없으면 베이컨). 불 끄고 섞는 게 포인트예요. 사진은 오늘 점심!", hoursAgo: 75, photo: "carbonara", foods: ["carbonara"], likes: 9 },
  { id: "seed-etc-1", category: "etc", author: "여행자J", title: "방콕에서 먹은 똠얌 맛 나는 곳 있을까요", body: "새콤하고 매콤한 그 맛이 그리워요. 서울에서 현지 맛에 가까운 태국 식당 추천 부탁해요.", hoursAgo: 90, photo: "tom-yum", foods: ["tom-yum", "pad-thai"], likes: 7 },
  { id: "seed-buddy-2", category: "buddy", author: "새내기", title: "내일 점심 학식 말고 밖에서 드실 분", body: "개강하고 아직 친구가 없어요 ㅠㅠ 메뉴는 같이 정해요. 마라탕이나 돈까스 생각 중!", hoursAgo: 12, place: "온수역 1번 출구", meetInHours: 22, capacity: 2, likes: 4, joins: 0 },
  // ── 모임 안 글 (카페형 모임: 가입한 사람만 쓴다)
  { id: "seed-club-halal-1", club: "seed-club-halal", category: "halal", author: "Aisha", title: "[정모] 토요일 이태원 할랄 투어", body: "이번 주 정모는 이태원 할랄 식당 두 곳 돌아요. 케밥 → 바클라바 디저트 코스! 처음 오시는 분도 환영해요.", hoursAgo: 6, place: "이태원역 3번 출구", meetInHours: 44, capacity: 6, photo: "doner-kebab", foods: ["doner-kebab", "baklava"], likes: 12, joins: 3 },
  { id: "seed-club-halal-2", club: "seed-club-halal", category: "halal", author: "Omar", title: "편의점 할랄 인증 제품 모음", body: "요즘 편의점에도 할랄 인증 제품이 늘었어요. 찾은 것들 사진으로 정리했어요.", hoursAgo: 30, likes: 9 },
  { id: "seed-club-mala-1", club: "seed-club-mala", category: "chinese", author: "마라중독", title: "마라탕 맵기 단계별 후기 (1~5단계)", body: "학교 근처 마라탕집 3곳 맵기 비교! 3단계부터는 진짜 각오하세요. 마라샹궈는 2단계 추천.", hoursAgo: 3, photo: "mapo-tofu", foods: ["mapo-tofu"], poll: { question: "최애 맵기는?", options: ["1~2단계", "3단계", "4단계 이상"], votes: [8, 15, 6] }, likes: 18 },
  { id: "seed-club-vegan-1", club: "seed-club-vegan", category: "vegetarian", author: "초록", title: "비건 한 끼 인증 — 차나 마살라", body: "병아리콩 커리로 오늘 점심 해결! 레시피는 댓글에 남길게요.", hoursAgo: 10, photo: "chana-masala", foods: ["chana-masala"], likes: 14 },
  { id: "seed-club-diet-1", club: "seed-club-diet", category: "diet", author: "헬린이", title: "이번 주 식단 인증 스레드", body: "아침 그릭요거트, 점심 포케, 저녁 월남쌈. 다들 이번 주 식단 남겨 주세요!", hoursAgo: 15, foods: ["goi-cuon"], likes: 10 },
];

/** 샘플 모임 (카페형). 가입 시각을 펼쳐 놓아 '급상승 모임'이 보이게 */
const CLUBS: { id: string; name: string; topic: ClubRow["topic"]; owner: string; description: string; daysAgo: number; photo?: string; members: number; recentJoins: number }[] = [
  { id: "seed-club-halal", name: "성공회대 할랄 밥상", topic: "halal", owner: "Aisha", description: "유학생·내국인 누구나! 학교 근처 할랄 식당을 같이 찾고 한 달에 두 번 정모해요.", daysAgo: 40, photo: "biryani", members: 38, recentJoins: 9 },
  { id: "seed-club-mala", name: "마라 원정대", topic: "chinese", owner: "마라중독", description: "마라탕·마라샹궈·훠궈 맛집 지도 만드는 중. 맵기 단계 후기 환영.", daysAgo: 25, photo: "hot-pot", members: 52, recentJoins: 12 },
  { id: "seed-club-vegan", name: "비건 한 끼", topic: "vegetarian", owner: "초록", description: "하루 한 끼라도 비건으로. 레시피·식당·장보기 정보를 나눠요.", daysAgo: 60, photo: "chana-masala", members: 27, recentJoins: 2 },
  { id: "seed-club-diet", name: "다이어트 식단 인증", topic: "diet", owner: "헬린이", description: "매일 식단 사진 한 장. 세계 음식으로 지루하지 않게 다이어트해요.", daysAgo: 90, photo: "greek-salad", members: 64, recentJoins: 0 },
  { id: "seed-club-ramen", name: "라멘 순례자들", topic: "japanese", owner: "라멘덕후", description: "돈코츠·쇼유·미소… 서울 라멘집 도장 깨기.", daysAgo: 12, photo: "ramen", members: 19, recentJoins: 1 },
  { id: "seed-club-collab", name: "퓨전 실험실", topic: "collab", owner: "퓨전셰프", description: "김치 타코, 불고기 반미처럼 세계 음식끼리 섞어 보는 모임.", daysAgo: 8, photo: "kimchi", members: 15, recentJoins: 4 },
];

// 지난 2주간의 행동 신호 — 할랄·채식이 최근 급상승, 콜라보·한식은 꾸준히 (브리핑 화면이 뭔가 말할 수 있게)
const SIGNAL_PLAN: [CategoryKey, SignalKind, number, number][] = [
  // [카테고리, 종류, 개수, 최근 며칠 안에]
  ["halal", "view", 26, 2],
  ["halal", "like", 9, 2],
  ["halal", "tap", 14, 2],
  ["vegetarian", "view", 18, 2],
  ["vegetarian", "vote", 12, 3],
  ["collab", "view", 20, 10],
  ["collab", "like", 10, 10],
  ["korean", "view", 16, 12],
  ["buddy", "join", 5, 4],
  ["buddy", "view", 14, 6],
  ["chinese", "vote", 10, 8],
  ["diet", "view", 9, 10],
  ["japanese", "tap", 8, 12],
  ["meat", "view", 6, 12],
  ["western", "view", 4, 13],
  ["etc", "tap", 5, 13],
];

export function previewSeed(photoOf: (slug: string) => Photo | null, now = Date.now()): MemorySeed {
  const HOUR = 3_600_000;
  const iso = (t: number) => new Date(t).toISOString();
  const posts: PostRow[] = POSTS.map((p) => ({
    id: p.id,
    club_id: p.club ?? null,
    author_key: `seed:${p.author}`,
    author_name: `${p.author} · 샘플`,
    category: p.category,
    title: p.title,
    body: p.body,
    place: p.place ?? null,
    // 약속 시각은 30분 단위로 (실제 글처럼)
    meet_at: p.meetInHours != null ? iso(Math.ceil((now + p.meetInHours * HOUR) / (HOUR / 2)) * (HOUR / 2)) : null,
    capacity: p.capacity ?? null,
    photos: p.photo ? [photoOf(p.photo)].filter((x): x is Photo => x != null) : [],
    poll: p.poll ? { question: p.poll.question, options: p.poll.options } : null,
    food_slugs: p.foods ?? [],
    country_codes: [],
    like_count: p.likes,
    comment_count: 0,
    join_count: p.joins ?? 0,
    created_at: iso(now - p.hoursAgo * HOUR),
  }));
  const comments = [
    { post_id: "seed-halal-1", author: "Omar", body: "신도림 쪽 터키 식당도 할랄 인증 있어요! 되네르 케밥 맛있어요.", h: 4 },
    { post_id: "seed-halal-1", author: "지수", body: "정리 감사해요. 친구 데려가 볼게요 👍", h: 3 },
    { post_id: "seed-veg-1", author: "비건7년차", body: "팔라펠은 튀김이라 든든하고, 후무스는 빵이랑 먹으면 꽤 배불러요.", h: 7 },
    { post_id: "seed-collab-1", author: "민지", body: "마라 떡볶이 꼭 해주세요ㅋㅋ", h: 25 },
    { post_id: "seed-buddy-1", author: "Lin", body: "저 갈게요! 베트남 음식 좋아해요.", h: 1 },
    { post_id: "seed-korean-1", author: "Hana", body: "외국 친구들은 불고기 거의 다 좋아하더라고요.", h: 50 },
  ].map((c, i) => ({ id: `seed-c-${i}`, post_id: c.post_id, author_key: `seed:${c.author}`, author_name: `${c.author} · 샘플`, body: c.body, created_at: iso(now - c.h * HOUR) }));
  for (const c of comments) {
    const p = posts.find((x) => x.id === c.post_id);
    if (p) p.comment_count++;
  }
  // 규칙적인 간격으로 펼친다 (무작위 X → 테스트·화면이 매번 같다)
  const signals: Pick<Signal, "kind" | "category" | "at">[] = SIGNAL_PLAN.flatMap(([category, kind, n, days]) =>
    Array.from({ length: n }, (_, i) => ({ kind, category, at: iso(now - ((i + 0.5) / n) * days * 24 * HOUR) })),
  );
  const pollVotes = Object.fromEntries(POSTS.filter((p) => p.poll).map((p) => [p.id, p.poll!.votes]));
  const clubs: ClubRow[] = CLUBS.map((c) => ({
    id: c.id,
    name: c.name,
    topic: c.topic,
    description: c.description,
    cover: c.photo ? photoOf(c.photo) : null,
    owner_key: `seed:${c.owner}`,
    owner_name: `${c.owner} · 샘플`,
    member_count: 0,
    post_count: 0,
    last_post_at: null,
    created_at: iso(now - c.daysAgo * 24 * HOUR),
  }));
  // 회원: 대부분은 오래전에, recentJoins 명은 최근 48시간 안에 가입 → 급상승 계산이 실제 규칙으로 돈다
  const members = CLUBS.flatMap((c) =>
    Array.from({ length: c.members }, (_, i) => ({
      club_id: c.id,
      key: `seed:${c.id}:${i}`,
      // 나머지는 만든 날부터 사흘 전까지 고르게
      at: iso(i < c.recentJoins ? now - ((i + 1) / (c.recentJoins + 1)) * 40 * HOUR : now - (3 + ((i - c.recentJoins) / Math.max(1, c.members - c.recentJoins)) * (c.daysAgo - 3)) * 24 * HOUR),
    })),
  );
  return { posts, comments, signals, pollVotes, clubs, members };
}
