import { NextResponse } from "next/server";
import { z } from "zod";

export const jsonError = (status: number, code: string, message: string, headers?: HeadersInit) =>
  NextResponse.json({ error: { code, message } }, { status, headers });

export function tooMany(retryAfterSec: number) {
  return jsonError(429, "rate_limited", "잠시 후 다시 물어봐 주세요.", { "Retry-After": String(retryAfterSec) });
}

export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<{ ok: true; data: z.infer<S> } | { ok: false; res: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: jsonError(400, "invalid_json", "JSON 본문이 필요합니다.") };
  }
  const r = schema.safeParse(raw);
  if (!r.success) return { ok: false, res: jsonError(400, "invalid_body", z.prettifyError(r.error)) };
  return { ok: true, data: r.data };
}
