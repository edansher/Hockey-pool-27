import { Link } from "wouter";
import { NhlSourcePanel } from "@/components/nhl-source-panel";
import { ChevronRight, BarChart3, BookOpenText, Users, Search } from "lucide-react";
import { TransactionsEntry } from "@/components/transactions";
import { PoolStandings } from "@/components/pool-standings";

const panel = "rounded-2xl border border-[#ded8ca] bg-[#faf8f1] p-4";

export function MobilePoolHome() {
  return <div className="page-in space-y-4 pb-4" data-testid="mobile-pool-home">
    <Link href="/rosters" aria-label="Teams and drafted players" data-testid="button-owners" className="flex min-h-11 items-center justify-between rounded-xl bg-[#173a4c] px-4 text-sm font-bold text-[#f5f0e5]">
        <span className="flex items-center gap-2"><Users className="h-5 w-5" />Teams / Drafted players</span><ChevronRight className="h-5 w-5" />
    </Link>
    <Link href="/who-has-him" aria-label="Who has him? Search current rosters" data-testid="button-who-has-him-mobile" className="flex min-h-12 items-center justify-between rounded-xl border border-[#c7addf] bg-[#e9ddf5] px-4 text-sm font-bold text-[#4f3569]">
      <span className="flex items-center gap-2"><Search className="h-5 w-5"/>Who has him?</span><ChevronRight className="h-5 w-5"/>
    </Link>
    <Link href="/polls" aria-label="Poolside Poll" data-testid="button-view-todays-poll" className="flex min-h-12 items-center justify-between rounded-xl border border-[#166534] bg-[#15803d] px-4 text-sm font-bold text-white">
      <span>Poolside Poll</span><ChevronRight className="h-5 w-5"/>
    </Link>
    <TransactionsEntry/>
    <Link href="/daily-analysis" aria-label="Previous pool day's analysis" data-testid="button-last-night-analysis" className="flex min-h-12 items-center justify-between rounded-xl bg-[#e57955] px-4 text-sm font-bold text-[#182f3a]">
      <span className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Previous pool day's analysis</span><ChevronRight className="h-5 w-5" />
    </Link>
    <section className={panel} data-testid="mobile-current-standings">
      <div className="mono text-[10px] font-semibold uppercase tracking-[.17em] text-[#bf583d]">The pool table · 2026–27</div>
      <h1 className="display mt-1 text-3xl font-bold text-[#173a4c]">Current standings</h1>
      <div className="mt-3"><PoolStandings showSource={false}/></div>
    </section>
    <NhlSourcePanel />
    <div className="grid gap-3 sm:grid-cols-2">
      <Link href="/rules" aria-label="Points system" data-testid="button-points-system" className="flex min-h-12 items-center justify-between rounded-xl bg-[#cf5633] px-4 text-sm font-bold text-white">
        <span className="flex items-center gap-2"><BookOpenText className="h-5 w-5" />Points system</span><ChevronRight className="h-5 w-5" />
      </Link>
      <Link href="/lines" aria-label="NHL lines" data-testid="button-home-lines" className="flex min-h-12 items-center justify-between rounded-xl border border-[#173a4c] px-4 text-sm font-bold text-[#173a4c] sm:col-span-2">
        <span>NHL lines</span><ChevronRight className="h-5 w-5" />
      </Link>
    </div>
  </div>;
}
