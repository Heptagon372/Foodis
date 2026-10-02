import { Suspense } from "react";
import { ClubCreateForm } from "@/components/community/ClubCreateForm";

export const metadata = { title: "모임 만들기 — FOODIS World Table" };

export default function NewClubPage() {
  return (
    <Suspense>
      <ClubCreateForm />
    </Suspense>
  );
}
