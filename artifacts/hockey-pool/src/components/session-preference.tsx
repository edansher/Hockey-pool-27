import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth, useClerk } from '@clerk/react';

/**
 * Browser-session preference ("Remember me"). Only a non-secret flag and a user id marker are stored here.
 * Credentials and tokens are managed solely by the Clerk SDK; this app never stores passwords or tokens.
 *  - localStorage  hp.remember : "false" = do not keep me signed in across browser sessions. Unset or "true" = remembered
 *    (unset keeps sessions that existed before this option shipped).
 *  - sessionStorage hp.pendingSignIn : set when an opted-out person is about to sign in or sign up in this tab.
 *  - sessionStorage hp.sessionUser  : the user id that signed in during this tab's browser session.
 */
const PREF = 'hp.remember';
const PENDING = 'hp.pendingSignIn';
const MARK = 'hp.sessionUser';
const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };

export const readRemember = () => safe(() => localStorage.getItem(PREF) !== 'false', true);
export function writeRemember(remember: boolean) {
  safe(() => {
    if (remember) { localStorage.removeItem(PREF); sessionStorage.removeItem(PENDING); } else { localStorage.setItem(PREF, 'false'); sessionStorage.setItem(PENDING, '1'); }
  }, undefined);
}
export const clearSessionMarkers = () => safe(() => { sessionStorage.removeItem(PENDING); sessionStorage.removeItem(MARK); }, undefined);

/** Withholds the app (so no private query runs) when an opted-out person returns in a new browser session. */
export function SessionGate({ children }: { children: ReactNode }) {
  const { isLoaded, userId } = useAuth();
  const { signOut } = useClerk();
  const started = useRef(false);
  const [, bump] = useState(0);
  const remember = readRemember();
  const pending = safe(() => sessionStorage.getItem(PENDING) === '1', false);
  const mark = safe(() => sessionStorage.getItem(MARK), null);
  const allowed = remember || pending || (userId != null && mark === userId);
  const blocked = !remember && (isLoaded ? userId != null && !allowed : mark == null && !pending);
  const expired = isLoaded && !!userId && !allowed;

  useEffect(() => {
    if (!isLoaded || !userId) { started.current = false; return; }
    if (allowed) {
      safe(() => { sessionStorage.setItem(MARK, userId); if (!remember) sessionStorage.removeItem(PENDING); }, undefined);
      return;
    }
    if (started.current) return;
    started.current = true;
    void signOut().catch(() => undefined).finally(() => { clearSessionMarkers(); bump(n => n + 1); });
  }, [isLoaded, userId, allowed, remember, signOut]);

  if (blocked) return <div className="grain flex min-h-[100dvh] items-center justify-center bg-[#f3f0e7] p-6" role="status" aria-live="polite" data-testid="session-gate">
    <p className="max-w-sm text-center text-sm text-[#53666e]">{expired ? 'You chose not to stay signed in on this browser. Signing you out of this device…' : 'Checking your sign-in preference…'}</p>
  </div>;
  return <>{children}</>;
}

export function RememberMe() {
  const { userId } = useAuth();
  const [remember, setRemember] = useState(readRemember);
  useEffect(() => { if (!readRemember()) safe(() => sessionStorage.setItem(PENDING, '1'), undefined); }, []);
  if (userId) return null;
  return <div className="mb-4 w-full max-w-[430px] rounded-xl border border-[#d8d1c3] bg-[#f0ece1] p-3 text-left text-xs leading-5 text-[#53666e]" data-testid="panel-remember-me">
    <label className="flex min-h-11 items-start gap-3 text-sm font-semibold text-[#254456]"><input type="checkbox" checked={remember} onChange={e => { setRemember(e.target.checked); writeRemember(e.target.checked); }} className="mt-1 h-5 w-5 accent-[#14546a]" data-testid="checkbox-remember-me" />Keep me signed in on this device</label>
    <p className="mt-1">{remember
      ? 'This browser can stay signed in on later visits until the session expires or you sign out. The sign-in service sets how long that is. Only choose this on your own device.'
      : 'When you come back in a new browser session or tab, this app signs you out before showing anything private. This is a setting of this app on this browser; the sign-in service may keep its own session until you return.'}</p>
    <p className="mt-1">This app never stores your password or sign-in tokens. The sign-in service handles them.</p>
  </div>;
}
