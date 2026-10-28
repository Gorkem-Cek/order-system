// localStorage can be missing or throw (private mode, blocked site data), so every access is
// guarded and the app works without it.

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not persisted; fine.
  }
}

export function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to remove.
  }
}
