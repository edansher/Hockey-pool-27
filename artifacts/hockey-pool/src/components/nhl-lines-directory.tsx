import { useMemo, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { DAILY_FACEOFF_TEAMS_URL, NHL_LINE_TEAMS, getDailyFaceoffLineUrl } from '@workspace/api-client-react';

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function NhlLinesDirectory() {
  const [q, setQ] = useState('');
  const teams = useMemo(() => {
    const n = fold(q.trim());
    return NHL_LINE_TEAMS.filter(t => !n || fold(t.name).includes(n) || fold(t.abbreviation).includes(n));
  }, [q]);
  return <div data-testid="lines-directory">
    <div className="mb-5 rounded-2xl border border-[#ded8ca] bg-[#faf8f1] p-5 text-sm leading-6 text-[#5c6b72]">
      Each club opens its Daily Faceoff line combinations page in a new tab. Those pages show Daily Faceoff's latest updates: forwards, defence pairings, power play and penalty kill units, goalies and source timestamps. They open outside this app. Hockey Pool does not fetch, copy or store lineups, and cannot promise when the source updates. Lines never affect pool scoring or ownership.
      <div className="mt-3"><a href={DAILY_FACEOFF_TEAMS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-[#15566d] underline underline-offset-2" data-testid="link-lines-full-source">Full Daily Faceoff team directory (opens in new tab)<ExternalLink size={14} aria-hidden="true"/></a></div>
    </div>
    <label className="mb-5 flex min-h-12 max-w-md items-center gap-2 rounded-xl border border-[#d8d1c3] bg-[#faf8f1] px-3">
      <Search size={16} className="text-[#82908c]" aria-hidden="true"/>
      <span className="sr-only">Search NHL clubs</span>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search club or abbreviation" className="w-full bg-transparent text-sm outline-none" data-testid="input-lines-search"/>
    </label>
    <div className="mono mb-3 text-[10px] uppercase tracking-[.16em] text-[#82908c]" role="status">{teams.length} of {NHL_LINE_TEAMS.length} clubs</div>
    {teams.length === 0 ? <div className="rounded-xl border border-dashed border-[#cfc8b9] bg-[#f6f3ea] p-8 text-center text-sm text-[#7a8582]">No club matches "{q}".</div> :
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{teams.map(t => <li key={t.slug}>
      <a href={getDailyFaceoffLineUrl(t)} target="_blank" rel="noopener noreferrer" aria-label={`${t.name} lines on Daily Faceoff, opens in new tab`} className="group flex min-h-14 items-center gap-3 rounded-xl border border-[#ded8ca] bg-[#faf8f1] px-4 py-3 transition hover:border-[#c65c3e] hover:bg-[#f4f0e6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#173a4c]" data-testid={`link-lines-${t.abbreviation.toLowerCase()}`}>
        <span className="mono w-9 text-xs font-semibold text-[#c65c3e]">{t.abbreviation}</span>
        <span className="flex-1 text-sm font-semibold text-[#254456]">{t.name}</span>
        <ExternalLink size={14} className="text-[#82908c] group-hover:text-[#c65c3e]" aria-hidden="true"/>
      </a></li>)}</ul>}
  </div>;
}
