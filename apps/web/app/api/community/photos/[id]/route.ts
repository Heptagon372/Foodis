// GET /api/community/photos/:id — 미리보기 모드에서 올린 사진 (서버 메모리). 운영은 Supabase Storage 공개 주소를 바로 쓴다
import { jsonError } from "@/lib/api/http";
import { previewPhoto } from "@/lib/community/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = previewPhoto((await params).id);
  if (!p) return jsonError(404, "photo_not_found", "사진이 없어요 (미리보기 사진은 서버를 다시 켜면 사라져요).");
  return new Response(Buffer.from(p.data, "base64"), { headers: { "Content-Type": p.media_type, "Cache-Control": "private, max-age=3600" } });
}
