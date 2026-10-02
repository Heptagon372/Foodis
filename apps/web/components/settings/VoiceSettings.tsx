"use client";
// Passport "음성 설정" 묶음: 두뇌(답변 AI) · 목소리(TTS) · 라디오 진행자 · 알아듣기(STT) — 각각 같은 모양의 설정 카드(settings/parts)
import { ModelPicker } from "./ModelPicker";
import { RecognitionSetting } from "./RecognitionSetting";
import { VoicePicker } from "./VoicePicker";

export function VoiceSettings() {
  return (
    <div className="space-y-4">
      <ModelPicker />
      <VoicePicker />
      <RecognitionSetting />
    </div>
  );
}
