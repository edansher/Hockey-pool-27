import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createTransaction, previewTransaction, getTransactionAccess, getGetAvailablePlayersQueryKey, useGetAvailablePlayers } from "./generated/api";
import type { TransactionInput, TransactionPreview } from "./generated/api.schemas";
import { ApiError } from "./custom-fetch";

export interface SwapStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
type Attempt = { key: string; body: TransactionInput };

// Each app supplies hooks from its own React pin. The peer-only API package must
// not install/import a second React runtime just to share this request lifecycle.
type StateSetter<T> = (value: T | ((previous: T) => T)) => void;
export interface SwapHooks {
  useState<T>(initial: T): [T, StateSetter<T>];
  useRef<T>(initial: T): { current: T };
  useEffect(effect: () => void | (() => void), dependencies: unknown[]): void;
}
/** The request key AND body survive uncertain responses and app restarts. */
export function useParticipantSwap(hooks: SwapHooks, accountId: string | null | undefined, storage: SwapStorage, makeKey: () => string) {
  const { useEffect, useRef, useState } = hooks;
  const client = useQueryClient();
  const access = useQuery({
    queryKey: ["/api/transaction-access", accountId ?? "guest"],
    queryFn: () => getTransactionAccess(),
    enabled: accountId !== undefined,
    staleTime: 0, refetchInterval: 30_000,
  });
  const available = useGetAvailablePlayers({ query: { queryKey: getGetAvailablePlayersQueryKey(), enabled: !!access.data?.owners.length, refetchInterval: 30_000 } });
  const pickups = (available.data?.rows ?? []).filter(p => p.position !== "G" && p.scoringStatus === "complete" && p.poolPoints !== null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<TransactionPreview | null>(null);
  const inFlight = useRef(false);
  const currentAccount = useRef(accountId);
  currentAccount.current = accountId;
  const storageKey = `hockey-pool:pending-swap:${accountId ?? "guest"}`;
  useEffect(() => {
    let alive = true;
    setAttempt(null); setReady(false); setMessage(""); setPreview(null);
    if (!accountId) { setReady(true); return; }
    storage.getItem(storageKey).then(raw => {
      if (!alive) return;
      if (raw) {
        const saved = JSON.parse(raw) as Attempt;
        if (!saved.key || !saved.body?.ownerId || !saved.body.outgoingPlayerId || !saved.body.incomingPlayerId) throw new Error("Invalid saved request");
        setAttempt(saved);
        setMessage("A previous submission needs confirmation. Retry it safely with its original request key.");
      }
      setReady(true);
    }).catch(() => { if (alive) setMessage("Saved request storage is unavailable. Enable storage before submitting a swap."); });
    return () => { alive = false; };
  }, [accountId, storageKey, storage]);

  async function review(body: TransactionInput) {
    if (inFlight.current || !accountId) return false;
    const reviewedAccount = accountId;
    inFlight.current = true; setBusy(true); setMessage(""); setPreview(null);
    try {
      const result = await previewTransaction(body);
      if (currentAccount.current !== reviewedAccount) return false;
      setPreview(result);
      return true;
    } catch (error) {
      if (currentAccount.current === reviewedAccount) setMessage(error instanceof ApiError ? error.message : "The eligibility review could not load. Retry before confirming.");
      return false;
    } finally { inFlight.current = false; setBusy(false); }
  }

  async function submit(body: TransactionInput) {
    if (!ready || inFlight.current || !accountId) return;
    const submittedAccount = accountId;
    if (!attempt && !preview) return;
    const next = attempt ?? { key: makeKey(), body: { ...body, acknowledged: true, eligibilityToken: preview!.eligibilityToken } };
    inFlight.current = true; setBusy(true); setMessage("");
    try {
      // Never send a request if its retry identity cannot be persisted first.
      await storage.setItem(storageKey, JSON.stringify(next));
      if (currentAccount.current !== submittedAccount) return;
      setAttempt(next);
      const saved = await createTransaction(next.body, { headers: { "Idempotency-Key": next.key } });
      await storage.removeItem(storageKey);
      void client.invalidateQueries();
      if (currentAccount.current === submittedAccount) {
        setAttempt(null); setPreview(null);
        setMessage(`Saved: ${saved.ownerName} dropped ${saved.outgoingPlayerName} and picked up ${saved.incomingPlayerName}. $50 recorded.`);
      }
    } catch (error) {
      if (currentAccount.current !== submittedAccount) return;
      const detail = error instanceof ApiError ? error.message : "The saved result could not be confirmed.";
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        // These responses are definite denials/rolled-back conflicts, not ambiguous saves.
         try { await storage.removeItem(storageKey); setAttempt(null); setPreview(null); } catch { /* retain the original key */ }
        void client.invalidateQueries();
        setMessage(`${detail} Refresh the choices and try again.`);
      } else {
        setMessage(`${detail} Retry this same submission to check safely; do not submit a different swap.`);
      }
    } finally { inFlight.current = false; setBusy(false); }
  }
  return { access, available, pickups, attempt, ready, busy, message, preview, review, submit };
}