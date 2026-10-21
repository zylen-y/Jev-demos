"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { API_KEY_STORAGE_KEY, maskApiKey, normalizeApiKey, readStoredKey, writeStoredKey } from "@/lib/key";
import { JevCallError } from "@/lib/jev/errors";
import { postModels } from "@/lib/jev/browser";

type KeyContextValue = {
  apiKey: string;
  ready: boolean;
  dialogOpen: boolean;
  open: () => void;
  close: () => void;
  save: (key: string) => void;
  clear: () => void;
};

const KeyContext = createContext<KeyContextValue | null>(null);

export function useKey(): KeyContextValue {
  const value = useContext(KeyContext);
  if (!value) throw new Error("useKey must be used inside KeyProvider");
  return value;
}

export function KeyProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKey] = useState("");
  const [ready, setReady] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        setApiKey(readStoredKey(window.localStorage));
      } catch {
        setApiKey("");
      }
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const value = useMemo<KeyContextValue>(
    () => ({
      apiKey,
      ready,
      dialogOpen,
      open: () => setDialogOpen(true),
      close: () => setDialogOpen(false),
      save: (key: string) => {
        const normalized = normalizeApiKey(key);
        try {
          writeStoredKey(window.localStorage, normalized);
        } catch {
          /* private mode: keep it in memory for this tab */
        }
        setApiKey(normalized);
      },
      clear: () => {
        try {
          writeStoredKey(window.localStorage, "");
        } catch {
          /* ignore */
        }
        setApiKey("");
      },
    }),
    [apiKey, dialogOpen, ready],
  );

  return (
    <KeyContext.Provider value={value}>
      {children}
      {dialogOpen ? <KeyDialog /> : null}
    </KeyContext.Provider>
  );
}

function KeyDialog() {
  const { apiKey, close, save, clear } = useKey();
  const [draft, setDraft] = useState(apiKey);
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  async function testKey() {
    const key = normalizeApiKey(draft);
    if (!key) {
      setStatus("Paste a key first.");
      return;
    }
    setChecking(true);
    setStatus(null);
    try {
      const models = await postModels({ apiKey: key });
      const names = models.map((model) => model.name).join(", ");
      save(key);
      setStatus(names ? `Key works. Models: ${names}.` : "Key works.");
    } catch (error) {
      setStatus(error instanceof JevCallError ? error.message : "Could not reach Jev.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="presentation">
      <button aria-label="Close API key dialog" className="absolute inset-0 bg-ink/40" onClick={close} type="button" />
      <div
        aria-labelledby="key-title"
        aria-modal="true"
        className="relative w-full max-w-lg rounded-2xl border border-line bg-card p-6 shadow-2xl"
        role="dialog"
      >
        <p className="mono text-[11px] uppercase tracking-[0.18em] text-muted">Bring your own key</p>
        <h2 className="serif mt-2 text-3xl" id="key-title">
          The key stays in this browser.
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          It is written to <span className="mono text-ink">{API_KEY_STORAGE_KEY}</span> in localStorage. Each demo sends it only as{" "}
          <span className="mono text-ink">Authorization: Bearer</span> to this app&apos;s proxy, which forwards the call to{" "}
          <span className="mono text-ink">POST /v1/systemone</span> and does not store it. Create one in the{" "}
          <a className="text-ink underline decoration-vermilion decoration-2 underline-offset-4" href="https://console.typesafe.ai/keys">
            TypeSafe console
          </a>
          .
        </p>
        <label className="mt-5 block text-sm" htmlFor="api-key">
          Jev API key
        </label>
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            className="mono w-full rounded-xl border border-line bg-paper px-3 py-3 text-sm"
            id="api-key"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Paste key"
            type={show ? "text" : "password"}
            value={draft}
          />
          <button className="rounded-xl border border-line px-3 text-sm" onClick={() => setShow((value) => !value)} type="button">
            {show ? "Hide" : "Show"}
          </button>
        </div>
        {status ? (
          <p className="mt-3 text-sm" role="status">
            {status}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="rounded-full bg-ink px-4 py-2 text-sm text-paper"
            onClick={() => {
              save(draft);
              close();
            }}
            type="button"
          >
            Save in this browser
          </button>
          <button className="rounded-full border border-line px-4 py-2 text-sm" disabled={checking} onClick={testKey} type="button">
            {checking ? "Checking…" : "Test key"}
          </button>
          {apiKey ? (
            <button
              className="rounded-full px-4 py-2 text-sm text-vermilion"
              onClick={() => {
                clear();
                setDraft("");
                setStatus("Key removed from this browser.");
              }}
              type="button"
            >
              Remove {maskApiKey(apiKey)}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function KeyButton({ prominent = false }: { prominent?: boolean }) {
  const { apiKey, ready, open } = useKey();
  const saved = ready && apiKey;
  return (
    <button
      className={
        prominent
          ? "rounded-full bg-vermilion px-5 py-3 text-sm text-white"
          : "rounded-full border border-line bg-card px-4 py-2 text-sm"
      }
      onClick={open}
      type="button"
    >
      {saved ? `Key ${maskApiKey(apiKey)}` : "Add API key"}
    </button>
  );
}
