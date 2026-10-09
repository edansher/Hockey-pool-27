import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Goal } from 'lucide-react';
import { useGetScoringRules, getGetScoringRulesQueryKey, useUpdateScoringRules } from '@workspace/api-client-react';
import type { ScoringRules } from '@workspace/api-client-react';

const NUM_FIELDS = [
  ['goal', 'Goal'], ['assist', 'Assist'], ['powerPlayGoal', 'Power-play goal'], ['shortHandedGoal', 'Short-handed goal'],
  ['overtimeGoal', 'Overtime goal'], ['forwardHatTrick', 'Forward hat trick'], ['defensemanHatTrick', 'Defenseman hat trick'],
  ['goalieTeamWin', 'Goalie team win'], ['goalieTeamShutoutWin', 'Goalie team shutout win'], ['goalieAssist', 'Goalie assist'], ['goalieGoal', 'Goalie goal'],
] as const;
const BOOL_FIELDS = [
  ['powerPlayBonusOnOvertime', 'Power-play bonus also applies to overtime goals'],
  ['powerPlayBonusOnHatTrick', 'Power-play bonus also applies to hat-trick goals'],
] as const;
type NumKey = typeof NUM_FIELDS[number][0];
type BoolKey = typeof BOOL_FIELDS[number][0];
type Draft = { base: ScoringRules; nums: Record<NumKey, string>; bools: Record<BoolKey, boolean> };

const makeDraft = (r: ScoringRules): Draft => ({
  base: r,
  nums: Object.fromEntries(NUM_FIELDS.map(([k]) => [k, String(r[k])])) as Record<NumKey, string>,
  bools: { powerPlayBonusOnOvertime: r.powerPlayBonusOnOvertime, powerPlayBonusOnHatTrick: r.powerPlayBonusOnHatTrick },
});
const parse = (s: string) => (s.trim() === '' ? NaN : Number(s));
const valid = (s: string) => { const n = parse(s); return Number.isFinite(n) && n >= 0 && n <= 1000; };
const when = (v?: string) => (v ? `${new Date(v).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Toronto' })} Toronto` : 'unavailable');

export function AdminScoringRules({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const rules = useGetScoringRules();
  const update = useUpdateScoringRules();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<{ status?: number; message: string } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const live = rules.data;

  const shell = (body: React.ReactNode) => (
    <section className="rounded-2xl border border-[#ded8ca] bg-[#faf8f1] p-6 shadow-[0_3px_16px_rgba(46,52,49,.035)]" data-testid="panel-scoring-rules" aria-busy={rules.isLoading}>
      <div className="flex items-center gap-2"><Goal size={17} className="text-[#c65c3e]" aria-hidden="true" /><div className="mono text-[10px] font-semibold uppercase tracking-[.16em] text-[#82908c]">{isAdmin ? 'Scoring rules · administrator' : 'Current scoring rules · read only'}</div></div>
      <div className="mt-4">{body}</div>
    </section>
  );

  if (rules.isLoading) return shell(<div className="space-y-2" aria-label="Loading scoring rules">{[0, 1, 2].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-[#ebe6db]" />)}</div>);
  if (rules.isError || !live) return shell(<div className="rounded-xl border border-[#e3b8aa] bg-[#fbede7] p-4 text-sm text-[#874838]" role="alert" data-testid="status-scoring-rules-error">Scoring rules could not load. <button className="ml-2 min-h-11 font-bold underline" onClick={() => rules.refetch()} data-testid="button-retry-scoring-rules">Retry</button></div>);

  const meta = <div className="mono text-[10px] text-[#87918e]" data-testid="text-scoring-rules-revision">Revision {live.revision} · last saved {when(live.effectiveFrom)}</div>;
  const readOnly = (
    <>
      {meta}
      <dl className="mt-4 grid grid-cols-2 gap-2">
        {NUM_FIELDS.map(([k, l]) => <div key={k} className="rounded-lg bg-[#f1ede3] p-2.5"><dt className="text-[10px] font-semibold text-[#778480]">{l}</dt><dd className="mono mt-1 text-sm font-semibold" data-testid={`text-scoring-rule-${k}`}>{live[k]}</dd></div>)}
        {BOOL_FIELDS.map(([k, l]) => <div key={k} className="col-span-2 rounded-lg bg-[#f1ede3] p-2.5"><dt className="text-[10px] font-semibold text-[#778480]">{l}</dt><dd className="mono mt-1 text-sm font-semibold">{live[k] ? 'Yes' : 'No'}</dd></div>)}
      </dl>
    </>
  );
  if (!isAdmin) return shell(readOnly);

  const stale = draft ? draft.base.revision !== live.revision : false;
  const allValid = draft ? NUM_FIELDS.every(([k]) => valid(draft.nums[k])) : true;
  const changes = draft ? [
    ...NUM_FIELDS.filter(([k]) => valid(draft.nums[k]) && parse(draft.nums[k]) !== draft.base[k]).map(([k, l]) => ({ label: l, from: String(draft.base[k]), to: String(parse(draft.nums[k])) })),
    ...BOOL_FIELDS.filter(([k]) => draft.bools[k] !== draft.base[k]).map(([k, l]) => ({ label: l, from: draft.base[k] ? 'Yes' : 'No', to: draft.bools[k] ? 'Yes' : 'No' })),
  ] : [];
  const canReview = !!draft && allValid && changes.length > 0 && !stale && !update.isPending;

  const cancel = () => { setDraft(null); setReviewing(false); setError(null); };
  const reload = async () => { cancel(); await rules.refetch(); };

  const save = async () => {
    if (!draft || !canReview) return;
    setError(null);
    try {
      const nums = Object.fromEntries(NUM_FIELDS.map(([k]) => [k, parse(draft.nums[k])])) as Record<NumKey, number>;
      const result = await update.mutateAsync({ data: { ...nums, ...draft.bools, expectedRevision: draft.base.revision, applyMode: 'historical' } });
      if (result && typeof (result as ScoringRules).revision === 'number') qc.setQueryData(getGetScoringRulesQueryKey(), result);
      await qc.invalidateQueries({ predicate: q => !String(q.queryKey[0] ?? '').includes('access') });
      setDraft(null); setReviewing(false);
      setSaved(`Saved. Season scoring was recalculated under revision ${(result as ScoringRules)?.revision ?? ''}.`);
    } catch (e) {
      const err = e as { status?: number; message?: string; data?: { error?: string; message?: string } | null };
      const detail = err.data?.message || err.data?.error || err.message || 'The server rejected this change.';
      setReviewing(false);
      setError({
        status: err.status,
        message: err.status === 409
          ? `${detail} No changes were saved.`
          : err.status && [400, 401, 403].includes(err.status)
            ? `${detail} No changes were saved.`
            : `${detail} Saving could not be confirmed. Reload the saved rules before retrying.`,
      });
    }
  };

  const setNum = (k: NumKey, v: string) => { setSaved(null); setDraft(d => ({ ...(d ?? makeDraft(live)), nums: { ...(d ?? makeDraft(live)).nums, [k]: v } })); };
  const setBool = (k: BoolKey, v: boolean) => { setSaved(null); setDraft(d => ({ ...(d ?? makeDraft(live)), bools: { ...(d ?? makeDraft(live)).bools, [k]: v } })); };
  const view = draft ?? makeDraft(live);

  return shell(<>
    {meta}
    {saved && <p className="mt-3 rounded-lg bg-[#e8eee6] p-3 text-sm font-semibold text-[#2b7154]" role="status" data-testid="status-scoring-rules-saved">{saved}</p>}
    {stale && <div className="mt-3 rounded-lg border border-[#e3b8aa] bg-[#fbede7] p-3 text-sm text-[#874838]" role="alert">The saved rules changed to revision {live.revision} while you were editing (your draft started from revision {draft!.base.revision}). Saving is blocked. Reload to discard your draft and start from the current values.
      <button className="ml-2 min-h-11 font-bold underline" onClick={reload} data-testid="button-reload-scoring-rules">Reload and discard draft</button></div>}
    {error && <div className="mt-3 rounded-lg border border-[#e3b8aa] bg-[#fbede7] p-3 text-sm text-[#874838]" role="alert" data-testid="status-scoring-rules-save-error">{error.message}
      {error.status === 409 && <button className="ml-2 min-h-11 font-bold underline" onClick={reload} data-testid="button-reload-scoring-rules">Reload and discard draft</button>}</div>}

    <p className="mt-3 text-sm leading-6 text-[#67767c]">Values are points, from 0 to 1000. Only the administrator can edit; the server verifies this on save.</p>
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {NUM_FIELDS.map(([k, l]) => {
        const bad = !valid(view.nums[k]);
        const changed = !bad && parse(view.nums[k]) !== live[k] && draft;
        return <label key={k} className="block text-xs font-semibold text-[#53666e]">{l}
          <input type="number" inputMode="decimal" min={0} max={1000} step="any" value={view.nums[k]} disabled={update.isPending || reviewing}
            onChange={e => setNum(k, e.target.value)} aria-invalid={bad} data-testid={`scoring-rule-${k}`}
            className={`mono mt-1 block min-h-11 w-full rounded-lg border bg-[#f5f1e7] px-3 text-base text-[#203443] ${bad ? 'border-[#b74836]' : changed ? 'border-[#c65c3e]' : 'border-[#d9d2c4]'}`} />
          {bad && <span className="mt-1 block text-[11px] text-[#b74836]" role="alert">Enter a number from 0 to 1000.</span>}
        </label>;
      })}
    </div>
    <div className="mt-4 space-y-2">
      {BOOL_FIELDS.map(([k, l]) => <label key={k} className="flex min-h-11 items-center gap-3 rounded-lg bg-[#f1ede3] px-3 text-sm font-semibold text-[#254456]">
        <input type="checkbox" className="h-5 w-5" checked={view.bools[k]} disabled={update.isPending || reviewing} onChange={e => setBool(k, e.target.checked)} data-testid={`scoring-rule-${k}`} />{l}</label>)}
    </div>

    {reviewing && draft && <div className="mt-5 rounded-xl border border-[#c65c3e] bg-[#fbf3ec] p-4" role="region" aria-label="Review scoring rule changes" data-testid="panel-scoring-review">
      <h3 className="display text-2xl font-bold text-[#173a4c]">Review before saving</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[#53666e]">
        <li>Saving recalculates season scoring for active players and the available-player rankings. Standings may change.</li>
        <li>This is not forward-only. Dropped-player frozen credits and pickup cutoffs stay unchanged.</li>
        <li>The timestamp shown is when rules were last saved, not a future activation date.</li>
      </ul>
      <p className="mono mt-3 text-xs font-semibold text-[#173a4c]" data-testid="text-scoring-revision-change">Revision {draft.base.revision} to a new revision assigned by the server</p>
      <table className="mt-2 w-full text-left text-sm" data-testid="table-scoring-changes"><thead><tr className="text-[11px] text-[#82908c]"><th className="py-1">Rule</th><th>Old</th><th>New</th></tr></thead>
        <tbody>{changes.map(c => <tr key={c.label} className="border-t border-[#e8dccf]"><td className="py-1.5 pr-2">{c.label}</td><td className="mono">{c.from}</td><td className="mono font-bold">{c.to}</td></tr>)}</tbody></table>
    </div>}

    <div className="mt-5 flex flex-wrap gap-3">
      {!reviewing ? <button className="min-h-11 rounded-lg bg-[#173a4c] px-4 py-2.5 text-sm font-bold text-[#f5f0e5] disabled:opacity-40" disabled={!canReview} onClick={() => setReviewing(true)} data-testid="button-review-scoring-rules">Review changes{changes.length ? ` (${changes.length})` : ''}</button>
        : <button className="min-h-11 rounded-lg bg-[#c65c3e] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40" disabled={!canReview} onClick={save} data-testid="button-confirm-scoring-rules">{update.isPending ? 'Saving and recalculating…' : 'Confirm and recalculate scoring'}</button>}
      {(draft || reviewing) && <button className="min-h-11 rounded-lg border border-[#d9d2c4] px-4 py-2.5 text-sm font-semibold text-[#173a4c] disabled:opacity-40" disabled={update.isPending} onClick={() => (reviewing ? setReviewing(false) : cancel())} data-testid="button-cancel-scoring-rules">{reviewing ? 'Back to editing' : 'Discard changes'}</button>}
    </div>
    {draft && !allValid && <p className="mt-2 text-xs text-[#b74836]">Fix the highlighted values to continue.</p>}
    {draft && allValid && changes.length === 0 && <p className="mt-2 text-xs text-[#82908c]">No changes to save.</p>}
  </>);
}
