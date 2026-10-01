// GET /api/radio?channel=today&start=<slug>&explored=KR,JP — Food Culture Radio 편성 (F-VOI-05)
// 대본은 DB 텍스트를 그대로 읽는다 (lib/radio/script.ts). 음성은 클라이언트가 세그먼트별로 /api/foodi/tts 에 요청
import { jsonError } from "@/lib/api/http";
import { getContent } from "@/lib/content";
import { buildRadio, isChannel } from "@/lib/radio/queue";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const channel = q.get("channel") ?? "today";
  if (!isChannel(channel)) return jsonError(400, "invalid_channel", "없는 채널이에요");
  const start = q.get("start");
  if (start && !/^[a-z0-9-]{1,80}$/.test(start)) return jsonError(400, "invalid_start", "잘못된 음식이에요");
  const explored = (q.get("explored") ?? "")
    .split(",")
    .filter((c) => /^[A-Z]{2}$/.test(c))
    .slice(0, 250);
  const content = await getContent();
  const radio = await buildRadio(content, { channel, start, explored });
  if (!radio.episodes.length) return jsonError(404, "no_episodes", "들려줄 이야기가 아직 없어요");
  return Response.json({ ...radio, mode: content.mode });
}
