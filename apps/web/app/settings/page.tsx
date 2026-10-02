import { SettingsView } from "@/components/settings/SettingsView";

export const metadata = { title: "설정 — FOODIS" };

// 설정: 화면 · 식단 · 푸디 음성 · 계정 (예전 Passport 하단에서 옮겨 옴)
export default function SettingsPage() {
  return <SettingsView />;
}
