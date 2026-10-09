import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, CircleHelp, LoaderCircle, Search, ShieldCheck } from "lucide-react";
import { PosBadge } from "@/components/position-style";
import {
  findPlayerOwners,
  getGetDraftRostersQueryKey,
  normalizePlayerSearch,
  POOL_REFRESH_INTERVAL_MS,
  useGetDraftRosters,
  type DraftRoster,
} from "@workspace/api-client-react";

const panel = "rounded-2xl border border-[#ded8ca] bg-[#faf8f1]";
const searchOptions = {
  staleTime: POOL_REFRESH_INTERVAL_MS,
  refetchInterval: POOL_REFRESH_INTERVAL_MS,
  refetchOnMount: true as const,
};

export function PlayerOwnerLookup() {
  const params = new URLSearchParams(window.location.search);
  const [query, setQuery] = useState(params.get("q") ?? "");
  const rosterQuery = useGetDraftRosters({
    query: { queryKey: getGetDraftRostersQueryKey(), ...searchOptions },
  });
  const results = useMemo(
    () => rosterQuery.data ? findPlayerOwners(rosterQuery.data as DraftRoster[], query) : [],
    [rosterQuery.data, query],
  );
  const hasQuery = !normalizePlayerSearch(query);

  function updateQuery(value: string) {
    setQuery(value);
    const next = new URL(window.location.href);
    if (value.trim()) next.searchParams.set("q", value);
    else next.searchParams.delete("q");
    window.history.replaceState({}, "", `${next.pathname}${next.search}${next.hash}`);
  }

  return <div className="space-y-5" data-testid="player-owner-lookup">
    <section className={`${panel} overflow-hidden`}>
      <div className="relative overflow-hidden bg-[#173a4c] px-5 py-6 text-[#f5f0e5] md:px-8 md:py-8">
        <div className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 rounded-full border border-white/10"/>
        <div className="pointer-events-none absolute -right-1 -top-8 h-44 w-44 rounded-full border border-white/10"/>
        <div className="relative z-10 max-w-2xl">
          <div className="mono text-[10px] font-semibold uppercase tracking-[.2em] text-[#e49a78]">Nine owners · current draft evidence</div>
          <h2 className="display mt-2 text-4xl font-bold leading-[.95] tracking-tight md:text-5xl">Find the owner.<br/><span className="text-[#e48a67]">Know who has him.</span></h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-[#d3d8d3]">Search a player name across the latest saved rosters, including individually confirmed goalies.</p>
        </div>
      </div>
      <div className="p-4 md:p-6">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={event => { event.preventDefault(); updateQuery(query); document.getElementById("player-owner-results")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }} role="search">
          <label className="flex min-h-14 flex-1 items-center gap-3 rounded-xl border border-[#d8d1c3] bg-[#f5f1e7] px-4 focus-within:outline focus-within:outline-2 focus-within:outline-[#173a4c]">
            <Search size={19} className="shrink-0 text-[#74827f]" aria-hidden="true"/>
            <span className="sr-only">Player name</span>
            <input autoComplete="off" value={query} onChange={event => updateQuery(event.target.value)} placeholder="Try a player name" className="min-w-0 flex-1 bg-transparent text-base text-[#203443] outline-none placeholder:text-[#929b95]" data-testid="input-who-has-him"/>
            {query && <button type="button" onClick={() => updateQuery("")} className="rounded-md px-2 py-1 text-xs font-semibold text-[#15566d] hover:bg-[#e7e2d7]" aria-label="Clear search">Clear</button>}
          </label>
          <button type="submit" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-[#e57955] px-6 text-sm font-bold text-[#182f3a] transition hover:bg-[#f18b68] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173a4c]" data-testid="button-search-owner"><Search size={17}/>Search rosters</button>
        </form>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#75817e]">
          <span>Names ignore case, accents, spaces, and punctuation.</span>
          <span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${rosterQuery.isError ? "bg-[#c65c3e]" : "bg-[#568365]"}`}/>{rosterQuery.isError ? "Refresh needs attention" : "Roster check refreshes every 5 minutes"}</span>
        </div>
      </div>
    </section>

    {rosterQuery.isLoading && !rosterQuery.data ? <div className={`${panel} p-5`} role="status" aria-busy="true" data-testid="status-rosters-loading">
      <div className="mb-4 h-4 w-40 animate-pulse rounded bg-[#e7e2d6]"/>
      {[0, 1, 2].map(i => <div key={i} className="mb-2 h-[76px] animate-pulse rounded-xl bg-[#ebe6db] last:mb-0"/>)}
      <span className="sr-only">Loading current draft rosters</span>
    </div> : null}

    {rosterQuery.isError && !rosterQuery.data ? <section className="rounded-2xl border border-[#e3b8aa] bg-[#fbede7] p-5 text-sm text-[#874838]" role="alert" data-testid="status-rosters-error">
      <h3 className="font-bold">Current rosters could not be loaded.</h3>
      <p className="mt-1">Try again to check the saved draft evidence.</p>
      <button type="button" onClick={() => void rosterQuery.refetch()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#874838] px-4 font-semibold text-[#fff8ef] hover:bg-[#713a2d]" data-testid="button-retry-rosters">Retry <ArrowRight size={15}/></button>
    </section> : null}

    {rosterQuery.data && rosterQuery.isError && <div className="rounded-xl border border-[#e3b8aa] bg-[#fbede7] px-4 py-3 text-sm text-[#874838]" role="status" data-testid="status-refresh-warning">The latest roster refresh failed. Showing the last successfully returned rosters. <button onClick={() => void rosterQuery.refetch()} className="ml-1 font-bold underline underline-offset-2">Retry</button></div>}

    {rosterQuery.data && <section id="player-owner-results" className={`${panel} overflow-hidden`} aria-live="polite" data-testid="player-owner-results">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e1dccf] px-5 py-4 md:px-6">
        <div><div className="mono text-[10px] font-semibold uppercase tracking-[.16em] text-[#82908c]">Saved roster evidence</div><h3 className="display mt-1 text-2xl font-bold text-[#173a4c]">{hasQuery ? "Enter a player name" : `${results.length} ${results.length === 1 ? "roster match" : "roster matches"}`}</h3></div>
        {!hasQuery && <span className="mono text-[10px] text-[#82908c]">{results.length ? "CURRENT ROSTERS" : "NO NAME FOUND"}</span>}
      </div>
      {hasQuery ? <div className="flex min-h-36 items-center gap-4 px-5 py-6 md:px-6">
        <CircleHelp className="shrink-0 text-[#c65c3e]" size={24}/>
        <p className="text-sm leading-6 text-[#67767c]">Search a player name to see its owner in the current saved rosters.</p>
      </div> : results.length === 0 ? <div className="flex min-h-36 items-start gap-4 px-5 py-6 md:px-6" data-testid="status-no-roster-match">
        <CircleHelp className="mt-1 shrink-0 text-[#c65c3e]" size={24}/>
        <div><h4 className="font-semibold text-[#294253]">No matching player on the current rosters.</h4><p className="mt-1 max-w-2xl text-sm leading-6 text-[#67767c]">This only means no match was found in today’s saved draft lists. It does not confirm that a player is available or unowned.</p></div>
      </div> : <ul className="divide-y divide-[#e7e1d5]">
        {results.map((match, index) => <li key={match.key} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-[#f5f1e7] sm:flex-row sm:items-center sm:justify-between md:px-6" data-testid={`row-player-owner-${index}`}>
          <div className="min-w-0">
             <div className="flex flex-wrap items-center gap-2"><span className="display text-xl font-bold text-[#173a4c]">{match.playerName}</span><PosBadge position={match.position}/></div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-[#77827f]"><span>{match.team ?? "Club not confirmed"}</span><span aria-hidden="true">·</span><span>{match.verified ? <span className="inline-flex items-center gap-1 text-[#52735f]"><ShieldCheck size={13}/>Roster evidence verified</span> : <span className="inline-flex items-center gap-1 text-[#8a6b39]"><LoaderCircle size={13}/>Name not fully verified</span>}</span></div>
          </div>
          <Link href={`/rosters/${encodeURIComponent(match.ownerId)}`} className="inline-flex min-h-12 items-center justify-between gap-4 rounded-xl border border-[#d7d0c2] bg-[#f0ece1] px-4 py-2 text-left transition hover:border-[#173a4c] hover:bg-[#e9e4d6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#173a4c]" data-testid={`link-player-owner-${index}`}>
             <span><span className="mono block text-[9px] font-semibold uppercase tracking-[.15em] text-[#82908c]">{match.verified ? "Owned by" : "Listed under"}</span><span className="block font-bold text-[#254456]">{match.ownerName}</span></span><ArrowRight size={17} className="shrink-0 text-[#15566d]"/>
          </Link>
        </li>)}
      </ul>}
      <div className="border-t border-[#e1dccf] bg-[#f5f1e7] px-5 py-3 text-xs leading-5 text-[#75817e] md:px-6">
        {rosterQuery.data.length} owner rosters checked. Results show saved selections; unresolved names are marked unverified.
      </div>
    </section>}

    {rosterQuery.data && rosterQuery.isFetching && <p className="inline-flex items-center gap-2 text-xs text-[#75817e]" role="status"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#c65c3e]"/>Checking for roster updates…</p>}
  </div>;
}