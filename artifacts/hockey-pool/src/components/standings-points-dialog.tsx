import { formatStandingsScoringTypes } from "@workspace/api-client-react";
import type { PoolStanding } from "@workspace/api-client-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function StandingsPointsDialog({
  owner,
  period = "today",
  snapshotDate,
  asOf,
  onOpenChange,
  onCloseAutoFocus,
}: {
  owner: PoolStanding | undefined;
  period?: "today" | "yesterday";
  snapshotDate?: string | null;
  asOf?: string | null;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: () => void;
}) {
  const open = Boolean(owner);
  const players = period === "yesterday" ? owner?.yesterdayScorers : owner?.todayScorers;
  const points = period === "yesterday" ? owner?.yesterdayPoints : owner?.livePoints;
  const periodLabel = period === "yesterday" ? "Yesterday’s" : "Today’s";
  const stamp = asOf
    ? new Date(asOf).toLocaleString()
    : snapshotDate
      ? new Date(`${snapshotDate.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="standings-points-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); onCloseAutoFocus(); }} className="max-h-[min(85dvh,720px)] gap-0 overflow-hidden border-[#ded8ca] bg-[#faf8f1] p-0 text-[#254456] sm:rounded-2xl">
        <DialogHeader className="border-b border-[#e5dfd3] px-5 pb-4 pt-5 text-left sm:px-6">
          <p className="mono text-[10px] uppercase tracking-[.16em] text-[#82908c]">Verified scoring</p>
          <DialogTitle className="display pt-1 text-3xl font-bold text-[#173a4c]">{owner?.name} · {periodLabel} points</DialogTitle>
          <p className="mono text-sm font-semibold text-[#173a4c]">Total: {points ?? "Pending"} pool points</p>
          <DialogDescription className="text-sm text-[#6c7a7d]">
            {stamp ? `Snapshot ${stamp}.` : "From the current standings snapshot."} Player points shown are the actual pool points counted for this owner.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
          {players?.length ? (
            <ul className="divide-y divide-[#e5dfd3]" data-testid="standings-scoring-players">
              {players.map((player, index) => (
                <li key={`${player.playerId}-${index}`} className="py-3 first:pt-0 last:pb-0" data-testid={`standings-scoring-player-${player.playerId}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#254456]">{player.playerName}</p>
                      <p className="mono mt-0.5 text-[10px] uppercase tracking-wide text-[#82908c]">{player.team}</p>
                      <p className="mono mt-2 text-xs text-[#55696f]">{formatStandingsScoringTypes(player) || "No counted event types"}</p>
                    </div>
                    <p className="mono shrink-0 text-right text-sm font-semibold tabular-nums text-[#173a4c]">
                      {player.poolPoints}<span className="ml-1 text-[10px] font-normal text-[#82908c]">pool pts</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : points === 0 && players !== undefined ? (
            <div className="rounded-xl border border-[#e5dfd3] bg-[#f1ede3] px-4 py-5" data-testid="standings-scoring-empty">
              <p className="font-semibold text-[#254456]">No scoring players {period}</p>
              <p className="mt-1 text-sm leading-6 text-[#6c7a7d]">This standings snapshot records zero points and no verified scoring events for {owner?.name}.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-[#e5dfd3] bg-[#f1ede3] px-4 py-5" data-testid="standings-scoring-unavailable">
              <p className="font-semibold text-[#254456]">Scoring detail unavailable</p>
              <p className="mt-1 text-sm leading-6 text-[#6c7a7d]">This snapshot does not include verified player evidence for {period}.</p>
            </div>
          )}
          <div className="mt-5 border-t border-[#e5dfd3] pt-4" data-testid="standings-scoring-key">
            <p className="mono text-[10px] uppercase tracking-[.14em] text-[#82908c]">Event key</p>
            <p className="mono mt-1 text-xs leading-6 text-[#55696f]">G goals · A assists · PPG power-play goals · SH short-handed goals · OTG overtime goals · W goalie wins · HAT hat trick</p>
            <p className="mt-2 text-xs leading-5 text-[#788480]">Event descriptors explain counted scoring evidence; they are not additional points.</p>
          </div>
        </div>
        <DialogFooter className="border-t border-[#e5dfd3] px-5 py-3 sm:px-6">
          <DialogClose asChild>
            <button type="button" data-testid="button-close-standings-points" className="min-h-10 rounded-lg border border-[#d9d2c4] bg-[#f1ede3] px-4 text-sm font-semibold text-[#254456] hover:bg-[#ebe6db] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15566d]">Close</button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
