import { useMemo } from "react";
import { POOL_REFRESH_INTERVAL_MS, getGetPoolScoringQueryKey, useGetPoolScoring } from "@workspace/api-client-react";

/** Reference-only Season Pool Points, indexed from getPoolScoring rows. Unknown stays null (never 0). */
export function useSeasonRefs() {
  const q = useGetPoolScoring({ query: { queryKey: getGetPoolScoringQueryKey(), staleTime: POOL_REFRESH_INTERVAL_MS, refetchInterval: POOL_REFRESH_INTERVAL_MS } });
  return useMemo(() => {
    const exact = new Map<string, number | null>();
    const loose = new Map<string, number | null | "ambiguous">();
    for (const r of q.data?.rows ?? []) {
      if (r.nhlPlayerId == null) continue;
      const v = r.seasonPoolPoints ?? null;
      exact.set(`${r.ownerId}/${r.round}/${r.nhlPlayerId}`, v);
      const k = `${r.ownerId}/${r.nhlPlayerId}`;
      loose.set(k, loose.has(k) && loose.get(k) !== v ? "ambiguous" : v);
    }
    return {
      /** ownerId/round/nhlPlayerId */
      exact: (ownerId: string, round: number, id: number | string | null): number | null => id == null ? null : exact.get(`${ownerId}/${round}/${id}`) ?? null,
      /** For reports that carry no round: only when the owner/player pair is unambiguous. */
      byPlayer: (ownerId: string, id: number | string | null): number | null => { if (id == null) return null; const v = loose.get(`${ownerId}/${id}`); return v === "ambiguous" || v === undefined ? null : v; },
    };
  }, [q.data]);
}

export function SeasonRef({ value, className = "" }: { value: number | null; className?: string }) {
  return <span className={`mono text-[10px] text-[#788480] ${className}`} data-testid="season-ref">Season ref. {value == null ? "—" : value}</span>;
}
