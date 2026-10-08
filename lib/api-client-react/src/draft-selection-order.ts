type DraftSelectionIdentity = {
  assetType: "skater" | "goalieTeam";
  confirmedName?: string | null;
  confirmedTeam?: string | null;
  reviewNote?: string | null;
  identityCheckedAt?: string | null;
  nhlPlayerId?: number | null;
};

type DraftSelection = DraftSelectionIdentity & {
  round: number;
  originalText: string;
  confirmedLastName?: string | null;
};

function hasConfirmedName(selection: DraftSelectionIdentity) {
  return Boolean(selection.confirmedName?.trim());
}

function hasConfirmedTeam(selection: DraftSelectionIdentity) {
  return Boolean(selection.confirmedTeam?.trim());
}

function needsDatedPlayerIdentity(selection: DraftSelectionIdentity) {
  return selection.assetType === "skater"
    && selection.nhlPlayerId != null
    && !selection.identityCheckedAt;
}

export function needsDraftSelectionConfirmation(selection: DraftSelectionIdentity) {
  return Boolean(selection.reviewNote?.trim())
    || (selection.assetType === "goalieTeam"
      ? !hasConfirmedTeam(selection)
      : !hasConfirmedName(selection) || !hasConfirmedTeam(selection) || needsDatedPlayerIdentity(selection));
}

export function isDraftSelectionVerified(selection: DraftSelectionIdentity) {
  return !needsDraftSelectionConfirmation(selection);
}

function stripInitialPrefix(label: string) {
  return label.trim().replace(/^(?:[A-Z]\.?\s+)+/i, "").trim();
}

function lastWord(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).at(-1) ?? "";
}

function compareNames(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
}

function displayName(selection: DraftSelection) {
  return (!selection.reviewNote && selection.assetType === "goalieTeam" && selection.confirmedTeam?.trim())
    || (!selection.reviewNote && selection.confirmedName?.trim())
    || stripInitialPrefix(selection.originalText);
}

function lastName(selection: DraftSelection) {
  return (!selection.reviewNote && selection.confirmedLastName?.trim())
    || lastWord(displayName(selection));
}

function firstName(selection: DraftSelection) {
  return displayName(selection).split(/\s+/).filter(Boolean)[0] ?? "";
}

export function sortDraftSelections<T extends DraftSelection>(selections: readonly T[]): T[] {
  return [...selections].sort((left, right) => {
    const leftIsGoalieTeam = left.assetType === "goalieTeam";
    const rightIsGoalieTeam = right.assetType === "goalieTeam";
    if (leftIsGoalieTeam !== rightIsGoalieTeam) return leftIsGoalieTeam ? 1 : -1;

    if (leftIsGoalieTeam) {
      return compareNames(displayName(left), displayName(right)) || left.round - right.round;
    }

    return compareNames(lastName(left), lastName(right))
      || compareNames(firstName(left), firstName(right))
      || left.round - right.round;
  });
}