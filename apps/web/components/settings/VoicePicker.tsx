"use client";
// 푸디 목소리 고르기 (TTS). 구현: TTS 담당 — lib/voice/catalog + 미리듣기
import { IconTile } from "../ui";

export function VoicePicker() {
  return (
    <div className="card flex items-center gap-3 rounded-3xl p-4">
      <IconTile icon="volume-on" tone="soft" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">푸디 목소리</p>
        <p className="text-caption text-muted">목소리 선택을 준비하고 있어요.</p>
      </div>
    </div>
  );
}
