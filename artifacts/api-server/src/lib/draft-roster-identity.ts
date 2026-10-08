import type { DraftRosterSelection } from "@workspace/db";
import type { PhotoConfirmedGoalie } from "@workspace/api-zod";
import { draftedGoalieRosterSnapshot } from "../data/drafted-goalie-rosters";
import { photoConfirmedGoalies } from "../data/photo-confirmed-goalies";
import {
  draftIdentitySnapshot,
  identitySnapshotKey,
  NHL_IDENTITY_CHECKED_AT,
  NHL_TEAM_NAMES,
  type DraftIdentitySnapshotEntry,
} from "../data/draft-roster-identities";

export type DraftRosterSelectionWithPhotoGoalies = DraftRosterSelection & {
  goalies?: PhotoConfirmedGoalie[];
  goalieNamesPending?: boolean;
};

/** Attach only the explicitly photo-confirmed individuals; club picks remain provenance. */
export function addPhotoConfirmedGoalies(
  ownerId: string,
  selections: readonly DraftRosterSelection[],
): DraftRosterSelectionWithPhotoGoalies[] {
  return selections.map(selection => {
    if (selection.assetType !== "goalieTeam") return selection;
    const goalies = photoConfirmedGoalies[`${ownerId}:${selection.round}`] ?? [];
    return {
      ...selection,
      goalies,
      goalieNamesPending: goalies.length === 0,
    };
  });
}

/** Resolve the approved NHL roster snapshot, preserving photo-confirmed pins. */
export function addConfirmedGoalies(
  ownerId: string,
  selections: readonly DraftRosterSelection[],
): DraftRosterSelectionWithPhotoGoalies[] {
  return addPhotoConfirmedGoalies(ownerId, selections).map(selection => {
    if (selection.assetType !== "goalieTeam") return selection;
    if (selection.adminGoalies) return { ...selection, goalies: selection.adminGoalies, goalieNamesPending: !selection.adminGoalies.length };
    const snapshot = draftedGoalieRosterSnapshot[`${ownerId}:${selection.round}`];
    if (!snapshot) return selection;
    const goaliesById = new Map<number, PhotoConfirmedGoalie>();
    for (const goalie of selection.goalies ?? []) goaliesById.set(goalie.nhlPlayerId, goalie);
    for (const [nhlPlayerId, confirmedName] of snapshot.goalies) {
      if (!goaliesById.has(nhlPlayerId)) {
        goaliesById.set(nhlPlayerId, {
          nhlPlayerId,
          confirmedName,
          confirmedTeam: snapshot.team,
          identitySource: `https://api-web.nhle.com/v1/roster/${snapshot.club}/20262027`,
        });
      }
    }
    return {
      ...selection,
      goalies: [...goaliesById.values()],
      goalieNamesPending: goaliesById.size === 0,
    };
  });
}

const verifiedDefensePlayerIds = new Set([
  8474590, 8481542, 8481581, 8477495, 8484873,
  8483457, 8479325, 8482122, 8478038, 8478397,
  8477504, 8481605, 8475167, 8474578, 8476906,
  8480839, 8476462, 8477346, 8482671, 8476885,
  8479323, 8479410, 8482730, 8482684, 8479425,
  8478178, 8481524, 8477447, 8477986, 8483495,
  8485366, 8480036, 8474600, 8476875, 8476853,
  8480069, 8478460, 8479345, 8484798, 8477932,
  8480803, 8480800, 8482105, 8480865, 8478407,
  8477969, 8483678, 8480817, 8481525,
]);

function candidateForPlayer(
  entry: Extract<DraftIdentitySnapshotEntry, { kind: "player" }>,
) {
  return {
    nhlPlayerId: entry.nhlPlayerId,
    name: entry.confirmedName,
    team: entry.confirmedTeam,
    position: verifiedDefensePlayerIds.has(entry.nhlPlayerId) ? "D" as const : "F" as const,
  };
}

function hasManualPlayerConflict(
  selection: DraftRosterSelection,
  entry: Extract<DraftIdentitySnapshotEntry, { kind: "player" }>,
) {
  const existingName = selection.confirmedName?.trim();
  const nameConflict = Boolean(
    existingName &&
    existingName.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase() !==
      entry.confirmedName.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase(),
  );
  const idConflict = selection.nhlPlayerId != null &&
    selection.nhlPlayerId !== entry.nhlPlayerId;
  return nameConflict || idConflict;
}

function withSourceAndDate(
  selection: DraftRosterSelection,
  sourceUrl: string,
  checkedAt: string,
): DraftRosterSelection {
  return {
    ...selection,
    identityCheckedAt: checkedAt,
    identitySource: sourceUrl,
  };
}

function ambiguousReviewNote(
  originalText: string,
  candidates: Array<{ name: string; team: string; position: "F" | "D" }>,
) {
  const names = candidates.map(({ name, team, position }) =>
    `${name} (${team}, ${position})`,
  ).join("; ");
  return `Needs pool-owner confirmation: “${originalText}” matches multiple official NHL skaters: ${names}.`;
}

function applyPlayerIdentity(
  selection: DraftRosterSelection,
  entry: Extract<DraftIdentitySnapshotEntry, { kind: "player" }>,
  checkedAt: string,
): DraftRosterSelection {
  if (hasManualPlayerConflict(selection, entry)) {
    const {
      confirmedLastName: _conflictingLastName,
      identityCheckedAt: _conflictingCheckedAt,
      identitySource: _conflictingSource,
      ...manualIdentity
    } = selection;
    return {
      ...manualIdentity,
      identityCandidates: [candidateForPlayer(entry)],
      reviewNote: `Manual identity “${selection.confirmedName ?? `NHL player ${selection.nhlPlayerId}`}” conflicts with the official match “${entry.confirmedName}”; the existing confirmation was preserved for review.`,
    };
  }

  const {
    identityCandidates: _previousCandidates,
    ...withoutPreviousCandidates
  } = selection;
  return {
    ...withoutPreviousCandidates,
    confirmedName: entry.confirmedName,
    confirmedLastName: entry.confirmedLastName,
    confirmedTeam: entry.confirmedTeam,
    nhlPlayerId: entry.nhlPlayerId,
    identityCheckedAt: checkedAt,
    identitySource: entry.sourceUrl,
    reviewNote: null,
  };
}

function applyAmbiguousIdentity(
  selection: DraftRosterSelection,
  entry: Extract<DraftIdentitySnapshotEntry, { kind: "ambiguous" }>,
  checkedAt: string,
): DraftRosterSelection {
  const manualChoice = selection.confirmedName || selection.nhlPlayerId
    ? ` Saved manual identity “${selection.confirmedName ?? `NHL player ${selection.nhlPlayerId}`}” was retained.`
    : "";
  const candidates = entry.candidates;
  return {
    ...withSourceAndDate(selection, entry.sourceUrl, checkedAt),
    identityCandidates: candidates,
    reviewNote: `${ambiguousReviewNote(selection.originalText, candidates)}${manualChoice}`,
  };
}

function applyGoalieTeam(
  selection: DraftRosterSelection,
  entry: Extract<DraftIdentitySnapshotEntry, { kind: "goalieTeam" }>,
  checkedAt: string,
): DraftRosterSelection {
  const conflict = Boolean(
    selection.confirmedTeam &&
    selection.confirmedTeam !== entry.confirmedTeam,
  );
  return {
    ...withSourceAndDate(selection, entry.sourceUrl, checkedAt),
    confirmedTeam: conflict ? selection.confirmedTeam : entry.confirmedTeam,
    reviewNote: conflict
      ? `Saved team “${selection.confirmedTeam}” conflicts with the official team for “${selection.originalText}” (${entry.confirmedTeam}); the saved team was preserved for review.`
      : null,
  };
}

/**
 * Enriches identities without mutating or reordering the original board picks.
 * Re-running this function is idempotent, and manual conflicting names/IDs
 * remain untouched and explicitly flagged.
 */
export function enrichDraftRosterSelections(
  ownerId: string,
  selections: readonly DraftRosterSelection[],
  checkedAt = NHL_IDENTITY_CHECKED_AT,
): DraftRosterSelection[] {
  const checkedTime = Date.parse(checkedAt);
  if (!Number.isFinite(checkedTime)) {
    throw new Error("Invalid checked-at date supplied to draft identity enrichment.");
  }

  return selections.map(selection => {
    // Pickups are pinned to the verified NHL catalog, not the original draft
    // board snapshot (which has no entry for newly acquired roster slots).
    if (selection.identitySource?.startsWith("Administrator")) return selection;
    if (selection.acquiredAt && selection.assetType === "skater" &&
        selection.nhlPlayerId && selection.confirmedName && selection.confirmedTeam &&
        selection.identitySource?.startsWith("Official NHL catalog;")) {
      return { ...selection, reviewNote: null,
        confirmedTeam: NHL_TEAM_NAMES[selection.confirmedTeam] ?? selection.confirmedTeam,
        identityCheckedAt: selection.identityCheckedAt ?? selection.acquiredAt };
    }
    const entry = draftIdentitySnapshot.get(
      identitySnapshotKey(ownerId, selection.round, selection.originalText),
    );
    if (!entry) {
      return {
        ...selection,
        reviewNote: selection.reviewNote ??
          `No verified NHL identity snapshot is available for “${selection.originalText}”; no player name or team was guessed.`,
      };
    }

    if (entry.kind === "player") {
      if (selection.assetType !== "skater") {
        throw new Error(`NHL player identity is attached to non-skater ${ownerId} round ${selection.round}.`);
      }
      return applyPlayerIdentity(selection, entry, checkedAt);
    }

    if (entry.kind === "ambiguous") {
      if (selection.assetType !== "skater") {
        throw new Error(`NHL candidates are attached to non-skater ${ownerId} round ${selection.round}.`);
      }
      return applyAmbiguousIdentity(selection, entry, checkedAt);
    }

    if (selection.assetType !== "goalieTeam") {
      throw new Error(`NHL team identity is attached to skater ${ownerId} round ${selection.round}.`);
    }
    return applyGoalieTeam(selection, entry, checkedAt);
  });
}