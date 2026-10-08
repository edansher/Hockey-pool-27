import { POOL_REFRESH_INTERVAL_MS, getGetScoringRulesQueryKey, useGetScoringRules } from "@workspace/api-client-react";

export function PoolRulebook() {
  const q = useGetScoringRules({ query: { queryKey: getGetScoringRulesQueryKey(), staleTime: POOL_REFRESH_INTERVAL_MS, refetchInterval: POOL_REFRESH_INTERVAL_MS } });
  if (q.isLoading) return <p role="status">Loading the saved pool rules…</p>;
  if (q.isError) return <p role="alert">Could not load the rules. <button className="underline" onClick={() => q.refetch()}>Retry</button></p>;
  const r = q.data;
  if (!r) return <p>No scoring rules have been saved.</p>;
  const bonus = r.powerPlayGoal - r.goal;
  const skaters = [
    ["Regular goal", r.goal, "Total per goal"],
    ["Assist", r.assist, "Separate: added to goal and hat-trick points"],
    ["Power-play goal", r.powerPlayGoal, `Total: ${r.goal} goal point + ${bonus} power-play bonus`],
    ["Short-handed goal", r.shortHandedGoal, "Total, not an additional regular-goal point"],
    ["Overtime goal", r.overtimeGoal, "Total for the three goals, before power-play bonuses"],
    ["Forward hat trick", r.forwardHatTrick, "Total for the three goals, before power-play bonuses"],
    ["Defenseman hat trick", r.defensemanHatTrick, "Total for the three goals, before power-play bonuses"],
  ] as const;
  const goalies = [
    ["Goaltender win", r.goalieTeamWin, "Individual goalie"],
    ["Shutout win", r.goalieTeamShutoutWin, `${r.goalieTeamShutoutWin} total instead of the win value, not ${r.goalieTeamShutoutWin} + ${r.goalieTeamWin}`],
    ["Goalie assist", r.goalieAssist, "Added to that goalie's total"],
    ["Goalie goal", r.goalieGoal, "Added to that goalie's total"],
  ] as const;
  const panel = "rounded-2xl border border-[#ded8ca] bg-[#faf8f1] p-5";
  return <div className="space-y-5">
    <section className="rounded-2xl border border-[#173a4c] bg-[#173a4c] p-5 text-[#f5f0e5]">
      <h2 className="display text-3xl font-bold">Confirmed power-play bonus</h2>
      <p className="mt-3 text-sm leading-6">A hat trick totals {r.forwardHatTrick} points for forwards or {r.defensemanHatTrick} points for defensemen. {r.powerPlayBonusOnHatTrick ? `Add ${bonus} extra point per power-play goal.` : "The saved hat-trick power-play bonus is disabled."} Assists are added separately. Do not add regular-goal points again on top of the hat-trick total.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-white/10 p-4" data-testid="example-overtime-power-play">
          <h3 className="text-sm font-semibold">Overtime power-play goal</h3>
          <p className="display mt-2 text-4xl font-bold">{r.overtimeGoal + (r.powerPlayBonusOnOvertime ? bonus : 0)} points</p>
          <p className="mt-1 text-xs">{r.overtimeGoal} overtime + {r.powerPlayBonusOnOvertime ? bonus : 0} power-play bonus</p>
        </div>
        <div className="rounded-xl bg-white/10 p-4" data-testid="example-hat-trick-two-power-play">
          <h3 className="text-sm font-semibold">Forward hat trick · two power-play goals</h3>
          <p className="display mt-2 text-4xl font-bold">{r.forwardHatTrick + (r.powerPlayBonusOnHatTrick ? 2 * bonus : 0)} points</p>
          <p className="mt-1 text-xs">{r.forwardHatTrick} hat trick + {r.powerPlayBonusOnHatTrick ? 2 * bonus : 0} power-play bonuses. Assists are extra.</p>
        </div>
        <div className="rounded-xl bg-white/10 p-4 sm:col-span-2" data-testid="example-hat-trick-two-power-play-two-assists">
          <h3 className="text-sm font-semibold">Forward: three goals (two power-play) + two assists</h3>
          <p className="display mt-2 text-4xl font-bold">{r.forwardHatTrick + (r.powerPlayBonusOnHatTrick ? 2 * bonus : 0) + 2 * r.assist} points</p>
          <p className="mt-1 text-xs">{r.forwardHatTrick} hat trick + {r.powerPlayBonusOnHatTrick ? 2 * bonus : 0} power-play bonuses + {2 * r.assist} assist points. Assists are counted separately.</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6">Hat trick with 0, 1, 2, or 3 power-play goals: forwards {[0, 1, 2, 3].map(count => r.forwardHatTrick + (r.powerPlayBonusOnHatTrick ? count * bonus : 0)).join(", ")} points; defensemen {[0, 1, 2, 3].map(count => r.defensemanHatTrick + (r.powerPlayBonusOnHatTrick ? count * bonus : 0)).join(", ")} points. Assists are extra.</p>
      <p className="mt-2 text-sm leading-6" data-testid="example-defenseman-hat-trick-two-assists">Defenseman: three ordinary goals + two assists = {r.defensemanHatTrick + 2 * r.assist} points ({r.defensemanHatTrick} total for the hat trick + {2 * r.assist} assist points).</p>
    </section>
    <div className="grid gap-5 lg:grid-cols-2">
      {[["Skater scoring", skaters], ["Goalie scoring", goalies]].map(([title, rows]) => <section key={title as string} className={panel}>
        <h2 className="display text-3xl font-bold text-[#173a4c]">{title as string}</h2>
        <dl className="mt-4 divide-y divide-[#e5dfd3]">
          {(rows as typeof skaters | typeof goalies).map(([label, points, note]) => <div key={label} className="flex gap-3 py-3"><div className="flex-1"><dt className="text-sm font-semibold">{label}</dt><dd className="mt-1 whitespace-pre-line text-xs leading-5 text-[#627177]">{note}</dd></div><span className="mono font-bold text-[#15566d]">{points}</span></div>)}
        </dl>
      </section>)}
    </div>
    <section className={panel}>
      <h2 className="display text-3xl font-bold text-[#173a4c]">Player changes and ownership</h2>
      <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-6 text-[#627177]">
        <li>Each participant starts with 9 replacement transactions. A drop and pickup together count as one change—not two.</li>
        <li>Show used and remaining changes on rosters and standings. At zero remaining, only an explicit administrator override can permit another change.</li>
        <li>Participants cannot drop or replace goalies. Only the administrator can make audited goalie corrections.</li>
        <li>Points earned while owned stay with that owner. Dropped players remain visible in the historical roster, marked DROPPED with a faint strikethrough.</li>
        <li>Every replacement starts at 0 points earned for your roster. Season Pool Points are reference-only and never transfer.</li>
        <li>A game's points count only if the complete transaction is saved at or before its officially scheduled start minus one minute. Missing the deadline excludes the entire game; scoring begins with the next eligible game on a following day. Unknown schedules remain Pending Verification.</li>
        <li>Each completed swap costs $50. Confirmation requires your acknowledgement; cancelled or failed attempts do not use a transaction or create a fee.</li>
        <li>The transaction ledger must include date, owner, outgoing and incoming players, transaction number, and changes remaining.</li>
      </ul>
    </section>
    <section className={panel}>
      <h2 className="display text-3xl font-bold text-[#173a4c]">Official regular-season games only</h2>
      <p className="mt-3 text-sm leading-6 text-[#627177]">Preseason and playoff games do not count toward this pool. No estimated or invented stats are used.</p>
      <p className="mt-3 text-xs leading-5 text-[#9c553b]">These rules are saved. Official NHL regular-season event scoring is connected, and imported identities are resolved unless a pick is flagged for review. Rare overlapping-goal cases remain pending manual confirmation. Verified participants can propose their own skater transactions from Draft Picks.</p>
    </section>
  </div>;
}