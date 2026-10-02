"use client";
// Passport "음성 설정" 묶음: 목소리(TTS) + 알아듣기(STT)
import { RecognitionSetting } from "./RecognitionSetting";
import { VoicePicker } from "./VoicePicker";

export function VoiceSettings() {
  return (
    <div className="space-y-3">
      <VoicePicker />
      <RecognitionSetting />
    </div>
  );
}
