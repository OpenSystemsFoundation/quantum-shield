import type { PendingAuth, Session } from './types.js';

const SESSION_KEY = 'qs.session.v1';
const PENDING_KEY = 'qs.pendingAuth.v1';
const ENV_PREF_KEY = 'qs.envChoice.v1';
const CLIENT_ID_PREFIX = 'qs.clientId.v1:';

export function saveSession(s: Session): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* sessionStorage unavailable */
  }
}

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}

export function savePendingAuth(p: PendingAuth): void {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
}

export function takePendingAuth(): PendingAuth | null {
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PENDING_KEY);
  try {
    return JSON.parse(raw) as PendingAuth;
  } catch {
    return null;
  }
}

export function saveEnvPreference(envId: string): void {
  try {
    localStorage.setItem(ENV_PREF_KEY, envId);
  } catch {
    /* noop */
  }
}

export function loadEnvPreference(): string | null {
  try {
    return localStorage.getItem(ENV_PREF_KEY);
  } catch {
    return null;
  }
}

export function clientIdKeyFor(loginUrl: string): string {
  return `${CLIENT_ID_PREFIX}${new URL(loginUrl).host.toLowerCase()}`;
}

export function saveClientId(loginUrl: string, clientId: string): void {
  try {
    localStorage.setItem(clientIdKeyFor(loginUrl), clientId);
  } catch {
    /* noop */
  }
}

export function loadClientId(loginUrl: string): string | null {
  try {
    return localStorage.getItem(clientIdKeyFor(loginUrl));
  } catch {
    return null;
  }
}

export function forgetClientId(loginUrl: string): void {
  try {
    localStorage.removeItem(clientIdKeyFor(loginUrl));
  } catch {
    /* noop */
  }
}
