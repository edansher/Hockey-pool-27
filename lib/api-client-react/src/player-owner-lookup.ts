import type { DraftRoster } from "./generated/api.schemas";
import { isDraftSelectionVerified } from "./draft-selection-order";

export interface PlayerOwnerMatch {
  key: string;
  playerName: string;
  team: string | null;
  position: "F" | "D" | "G";
  ownerId: string;
  ownerName: string;
  verified: boolean;
}

export const normalizePlayerSearch = (value: string): string =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/['’]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Current ownership only: retained dropped picks are scoring history, not owners. */
export function findPlayerOwners(rosters: DraftRoster[], query: string): PlayerOwnerMatch[] {
  const terms = normalizePlayerSearch(query).split(" ").filter(Boolean);
  if (!terms.length) return [];
  const results = new Map<string, PlayerOwnerMatch>();
  for (const owner of rosters) {
    for (const pick of owner.selections) {
      if (pick.droppedAt) continue;
      const players = pick.assetType === "goalieTeam"
        ? (pick.goalies?.length ? pick.goalies.map(goalie => ({
          name: goalie.confirmedName, team: goalie.confirmedTeam,
          id: goalie.nhlPlayerId, position: "G" as const, verified: true,
        })) : [{
          name: pick.originalText, team: pick.confirmedTeam ?? null,
          id: null, position: "G" as const, verified: false,
        }])
        : [{
          name: pick.confirmedName?.trim() || pick.originalText,
          team: pick.confirmedTeam ?? null, id: pick.nhlPlayerId ?? null,
          position: pick.position === "D" ? "D" as const : "F" as const,
          verified: isDraftSelectionVerified(pick),
        }];
      for (const player of players) {
        const searchable = normalizePlayerSearch(`${player.name} ${player.team ?? ""}`);
        const compact = searchable.replace(/\s/g, "");
        if (!terms.every(term => searchable.includes(term) || compact.includes(term))) continue;
        const key = JSON.stringify([owner.id, player.id ?? normalizePlayerSearch(player.name)]);
        results.set(key, {
          key, playerName: player.name, team: player.team, position: player.position,
          ownerId: owner.id, ownerName: owner.name, verified: player.verified,
        });
      }
    }
  }
  return [...results.values()].sort((a, b) =>
    a.playerName.localeCompare(b.playerName) || a.ownerName.localeCompare(b.ownerName));
}