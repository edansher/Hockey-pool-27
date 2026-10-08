import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getGetDraftRostersQueryKey, getGetPoolScoringQueryKey, getGetStandingsQueryKey, getGetAvailablePlayersQueryKey,
  getGetTransactionsQueryKey, getGetTransactionSummaryQueryKey,
  latestCompletedTransaction, recentCompletedTransactions, transactionAlertRemainingMs, transactionButtonRemainingMs, transactionTickerRemainingMs, useGetTransactions, useGetTransactionSummary,
} from '@workspace/api-client-react';
import { startTransactionChime } from './transaction-chime';

const KEY = 'hockey-pool:last-seen-transaction-id';
const POLL_MS = 10000;

function readSeen(): { id: string | null; ok: boolean } {
  try { return { id: window.localStorage.getItem(KEY), ok: true }; } catch { return { id: null, ok: false }; }
}
function writeSeen(id: string): boolean {
  try { window.localStorage.setItem(KEY, id); return window.localStorage.getItem(KEY) === id; } catch { return false; }
}
const alertedThisVisit = new Set<string>();

export function useTransactionAlert(notify = true) {
  const query = useGetTransactions({ query: { queryKey: getGetTransactionsQueryKey(), refetchInterval: POLL_MS, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: 'always', refetchOnReconnect: true } });
  const [seen, setSeen] = useState(readSeen);
  const [persistFailed, setPersistFailed] = useState(() => !seen.ok);
  const [buttonFlashing, setButtonFlashing] = useState(false);
  const [alertClock, setAlertClock] = useState(Date.now);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [soundPlaying, setSoundPlaying] = useState(false);
  const cancelSound = useRef<(() => void) | null>(null);
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');

  useEffect(() => {
    const f = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);

  const latest = useMemo(() => latestCompletedTransaction(query.data ?? []), [query.data]);
  const latestId = latest?.id ?? null;
  const recentTransactions = useMemo(() => recentCompletedTransactions(query.data ?? [], alertClock), [query.data, alertClock]);
  const alerting = notify && visible && recentTransactions.length > 0;

  const qc = useQueryClient();
  const syncedId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!query.isSuccess) return;
    const prev = syncedId.current;
    syncedId.current = latestId;
    if (prev === undefined || prev === latestId) return;
    for (const queryKey of [getGetDraftRostersQueryKey(), getGetPoolScoringQueryKey(), getGetStandingsQueryKey(), getGetAvailablePlayersQueryKey(), getGetTransactionSummaryQueryKey()]) {
      void qc.invalidateQueries({ queryKey });
    }
  }, [latestId, query.isSuccess, qc]);
  const unread = latestId !== null && latestId !== seen.id;

  // Reading history does not end this window, and returning does not restart it.
  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => {
      const now = Date.now();
      setAlertClock(now);
      const active = recentCompletedTransactions(query.data ?? [], now);
      const remaining = transactionButtonRemainingMs(query.data ?? [], now);
      setButtonFlashing(notify && visible && remaining > 0);
      if (notify && visible && remaining > 0) {
        timer = window.setTimeout(refresh, Math.min(remaining, ...active.map(t => transactionTickerRemainingMs(t, now)), 60_000));
      }
    };
    refresh();
    return () => window.clearTimeout(timer);
  }, [notify, visible, latestId, latest?.effectiveAt, latest?.createdAt, query.dataUpdatedAt]);

  const stopSound = useCallback(() => { cancelSound.current?.(); cancelSound.current = null; }, []);
  const playSound = useCallback(() => {
    stopSound();
    const remaining = transactionAlertRemainingMs(latest);
    if (!notify || !visible || remaining <= 0) return;
    cancelSound.current = startTransactionChime({
      pendingWindowMs: remaining,
      onStart: () => { setSoundBlocked(false); setSoundPlaying(true); },
      onBlocked: () => { setSoundBlocked(true); setSoundPlaying(false); },
      onStop: () => { setSoundBlocked(false); setSoundPlaying(false); },
    });
  }, [notify, visible, latest?.id, latest?.effectiveAt, latest?.createdAt, stopSound]);

  // Once per drop per site entry, including after previously reading history.
  // Defer until after StrictMode's setup/cleanup rehearsal.
  useEffect(() => {
    if (!notify || !visible || !latestId || alertedThisVisit.has(latestId) ||
        transactionAlertRemainingMs(latest) <= 0) return;
    const timer = window.setTimeout(() => {
      alertedThisVisit.add(latestId);
      playSound();
    }, 0);
    return () => { window.clearTimeout(timer); stopSound(); };
  }, [notify, visible, latestId, playSound, stopSound]);

  const markSeen = useCallback((id?: string | null) => {
    const target = id ?? latestId;
    if (!target) return;
    const ok = writeSeen(target);
    if (!ok) setPersistFailed(true);
    setSeen({ id: target, ok });
  }, [latestId]);

  return { query, latest, recentTransactions, unread, alerting, buttonFlashing, markSeen, persistFailed,
    soundBlocked, soundPlaying, playSound, stopSound };
}

export function useTransactionSummaryPolling() {
  return useGetTransactionSummary({ query: { queryKey: getGetTransactionSummaryQueryKey(), refetchInterval: POLL_MS, refetchOnWindowFocus: true, refetchOnReconnect: true } });
}
