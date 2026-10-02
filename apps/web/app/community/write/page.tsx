import { Suspense } from "react";
import { ComposeForm } from "@/components/community/ComposeForm";

export const metadata = { title: "글쓰기 — FOODIS World Table" };

export default function WritePage() {
  return (
    <Suspense>
      <ComposeForm />
    </Suspense>
  );
}
