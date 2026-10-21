import { Suspense } from "react";
import { Gallery } from "@/components/gallery";

export const metadata = { title: "Gallery" };

export default function Page() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-6xl px-5 py-16 text-sm text-muted">Loading the gallery…</main>}>
      <Gallery />
    </Suspense>
  );
}
