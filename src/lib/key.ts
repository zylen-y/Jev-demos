/** localStorage key. The API key never goes in a cookie or the URL. */
export const API_KEY_STORAGE_KEY = "jev-atlas.apiKey";

export function normalizeApiKey(key: string): string {
  return key.trim();
}

export function maskApiKey(key: string): string {
  const trimmed = normalizeApiKey(key);
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

type KeyStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function readStoredKey(storage: KeyStorage): string {
  return normalizeApiKey(storage.getItem(API_KEY_STORAGE_KEY) ?? "");
}

export function writeStoredKey(storage: KeyStorage, key: string): void {
  const normalized = normalizeApiKey(key);
  if (!normalized) {
    storage.removeItem(API_KEY_STORAGE_KEY);
    return;
  }
  storage.setItem(API_KEY_STORAGE_KEY, normalized);
}
