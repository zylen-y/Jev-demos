"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-24">
      <h1 className="serif text-5xl">Something broke in the page.</h1>
      <p className="mt-4 text-sm text-muted">{error.message}</p>
      <button className="mt-6 rounded-full bg-ink px-4 py-2 text-sm text-paper" onClick={reset} type="button">
        Try again
      </button>
    </main>
  );
}
