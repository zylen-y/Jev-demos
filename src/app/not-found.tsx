import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-24">
      <p className="mono text-[11px] uppercase tracking-[0.18em] text-muted">404</p>
      <h1 className="serif mt-3 text-5xl">That demo is not on the map.</h1>
      <Link className="mt-6 inline-block text-sm underline decoration-vermilion decoration-2 underline-offset-4" href="/gallery">
        Back to the gallery
      </Link>
    </main>
  );
}
