import type { PhotoConfirmedGoalie } from "@workspace/api-zod";
import { draftedGoalieRosterSnapshot } from "./drafted-goalie-rosters";

/**
 * Ownership evidence: IMG_3024, IMG_3025, IMG_3028, IMG_3029 and IMG_3030
 * uploaded on 2026-10-01. Only rows explicitly labelled Goalie are included.
 * NHL IDs and current clubs were checked against official player landing pages.
 * Screenshot club labels do not override a verified current NHL club.
 */
export const photoConfirmedGoalieIdsBySlot: Record<string, readonly number[]> = {
  "cohen:12": [8477465, 8475883, 8482221],
  "cohen:19": [8482657, 8478872],
  "drb-and-son:6": [8483548, 8481611, 8480051],
  "drb-and-son:13": [8480022, 8480280],
  "edan:12": [8482487, 8478470],
  "edan:20": [8481551, 8483475, 8480045, 8479312],
  "jimmy:6": [8483710, 8476883],
  "jimmy:15": [8478009, 8473575],
  "joe:7": [8475809, 8478406, 8481529],
  "joe:18": [8482137, 8477968, 8480356],
  "korm:13": [8476932, 8475683, 8478007],
  "korm:18": [8476914, 8478048],
  "nana:12": [8474593, 8481033],
  "nana:18": [8478499, 8479394],
  "rob:8": [8479193, 8479979],
  "rob:10": [8479406, 8475717, 8482661],
  "weezbark:10": [8480313],
  "weezbark:18": [8480843, 8478024],
};

const additionalIdentities: Record<number, { name: string; team: string }> = {
  8479406: { name: "Filip Gustavsson", team: "Minnesota Wild" },
  8481529: { name: "Trent Miner", team: "Colorado Avalanche" },
  8480356: { name: "Kyle Keyser", team: "San Jose Sharks" },
  8483475: { name: "Topias Leinonen", team: "Buffalo Sabres" },
  8480051: { name: "Cayden Primeau", team: "Carolina Hurricanes" },
  8478007: { name: "Elvis Merzlikins", team: "Toronto Maple Leafs" },
};

export const photoConfirmedGoalies: Record<string, PhotoConfirmedGoalie[]> =
  Object.fromEntries(Object.entries(photoConfirmedGoalieIdsBySlot).map(([slot, ids]) => {
    const snapshot = draftedGoalieRosterSnapshot[slot];
    if (!snapshot) throw new Error(`Photo goalie ownership has no original draft slot: ${slot}`);
    return [slot, ids.map(nhlPlayerId => {
      const existing = snapshot.goalies.find(([id]) => id === nhlPlayerId);
      const identity = additionalIdentities[nhlPlayerId]
        ?? (existing ? { name: existing[1], team: snapshot.team } : undefined);
      if (!identity) throw new Error(`Unverified photo goalie NHL ID: ${nhlPlayerId}`);
      return {
        nhlPlayerId,
        confirmedName: identity.name,
        confirmedTeam: identity.team,
        identitySource: `https://api-web.nhle.com/v1/player/${nhlPlayerId}/landing`,
      };
    })];
  }));