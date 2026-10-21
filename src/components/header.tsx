import Link from "next/link";
import { KeyButton } from "./key-context";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link className="flex items-center gap-2" href="/">
          <Mark />
          <span className="serif text-xl leading-none">Jev Atlas</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link className="hidden sm:inline" href="/gallery">
            Gallery
          </Link>
          <a className="hidden md:inline" href="https://docs.typesafe.ai/concepts/use-case-map">
            Use-case map
          </a>
          <KeyButton />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>Live System One demos. Your key, your calls.</p>
        <div className="flex flex-wrap gap-4">
          <a href="https://docs.typesafe.ai/introduction/quickstart">Quick start</a>
          <a href="https://docs.typesafe.ai/api/system-one">API</a>
          <a href="https://docs.typesafe.ai/sdk/javascript">JavaScript SDK</a>
          <a href="https://console.typesafe.ai/keys">Console</a>
        </div>
      </div>
    </footer>
  );
}

function Mark() {
  return (
    <svg aria-hidden="true" className="h-7 w-7" viewBox="0 0 32 32">
      <rect fill="#17160F" height="32" rx="7" width="32" />
      <path d="M8 20.5a8 8 0 1 1 13.5 5" fill="none" stroke="#EFEAE0" strokeWidth="1.6" />
      <path d="M16 16l6.2-4.2" fill="none" stroke="#E23B16" strokeLinecap="round" strokeWidth="1.6" />
      <circle cx="16" cy="16" fill="#E23B16" r="1.4" />
    </svg>
  );
}
