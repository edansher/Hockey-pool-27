// Faithful transcription of the two draft boards supplied by the pool owner.
// D: = yellow defenseman cell; G: = green goalie-team cell.
// These are source labels, NOT verified NHL player identities.
import type { PhotoConfirmedGoalie } from "@workspace/api-zod";

const boards = [
  { id: "cohen", name: "COHEN", picks: [
    "McDavid", "Caufield", "Connor", "Point", "Reinhart", "D:Carlson",
    "Hintz", "Larkin", "D:Seider", "Hyman", "Nugent-Hopkins", "G:EDM",
    "Martone", "D:Harley", "Duchene", "D:Jones", "Frondell", "Pettersson",
    "G:UTAH", "D:C. Hutson",
  ]},
  { id: "weezbark", name: "WEEZBARK", picks: [
    "MacKinnon", "Rantanen", "D:L. Hutson", "Carlson", "Demidov", "Cooley",
    "Marchenko", "Tuch", "Batherson", "G:Was", "McKenna", "Kyrou",
    "D:McAvoy", "Nelson", "Bedard", "D:Faber", "A. Protas", "G:ANA",
    "D:Toews", "D:Andersson",
  ]},
  { id: "rob", name: "ROB", picks: [
    "Draisatl", "Suzuki", "Schiefele", "Barkov", "Debrincat", "Raymond",
    "Forsberg", "G:Dallas", "D:Morrissey", "G:Minny", "D:LaCombe",
    "D:Hedman", "D:E. Karlsson", "Barzal", "D:Gostisbehere", "Zuccarello",
    "Hertl", "Trochek", "Zacha", "Boeser",
  ]},
  { id: "korm", name: "KORM", picks: [
    "Kucherow", "Matthews", "Marner", "Keller", "D:Dahlin", "Zibanejad",
    "Bratt", "Schmaltz", "Hishchier", "Valaridi", "Zegras", "W. Karlsson",
    "G:TOR", "Stamkos", "Kreider", "D:Hamilton", "D:Weegar", "G:NYR",
    "D:Power", "D:Trouba",
  ]},
  { id: "edan", name: "EDAN", picks: [
    "Kaprizov", "Johnston", "Boldy", "Stuzle", "Guenther", "D:Fox",
    "Slafkovsky", "Smith", "Dorefoev", "D:Sergachev", "Peterka", "G:MTL",
    "D:Clarke", "Miller", "Erikkson Ek", "D:L. Hughes", "D:Hronek",
    "Benson", "Cozens", "G:BUF",
  ]},
  { id: "joe", name: "JOE", picks: [
    "Celebrini", "Necas", "Nylander", "M. Tkachuk", "C. Gauthier", "D:Raddysh",
    "G:Colorado", "Thomas", "Sencke", "D:Byram", "Wilson", "D. Strome",
    "D:Theordre", "Ovechkin", "D:Montour", "Snuggerud", "Byfield", "G:SJS",
    "Stankoven", "D:Nemec",
  ]},
  { id: "drb-and-son", name: "DrB & Son", picks: [
    "Pasternak", "Eichel", "J. Hughes", "Aho", "D:Schaeffer", "G:Carolina",
    "D:Heiskanen", "Svechnikov", "D:Josi", "Mitchkov", "Stenberg", "Stone",
    "G:BOS", "McMann", "D:Matheson", "Eklund", "Cirelli", "D:Rielly",
    "Cowan", "Machielli",
  ]},
  { id: "nana", name: "NANA", picks: [
    "Panarin", "D:Makar", "Guentzel", "D:Werenski", "Crosby", "Hagel",
    "Tavares", "Kempe", "Konecny", "D:Chychrun", "Fantili", "G:FLA",
    "Geekie", "Holloway", "Rust", "Knies", "D:Buium", "G:VGK",
    "D:Ekblad", "Malkin",
  ]},
  { id: "jimmy", name: "JIMMY", picks: [
    "Robertson", "D:Bouchard", "D:Q. Hughes", "Thompson", "B. Tkachuk",
    "G:Tampa", "Ehlers", "Kane", "D:Sanderson", "Horvat", "O'Reilly",
    "Bennett", "D:Dobson", "Jarvis", "G:NYI", "Verhaghe", "Kadri",
    "D:Dunn", "Coyle", "Coleman",
  ]},
];

export type DraftSelection = {
  round: number;
  originalText: string;
  assetType: "skater" | "goalieTeam";
  position: "F" | "D" | "G";
  reviewNote: string | null;
  confirmedName?: string;
  confirmedTeam?: string | null;
  confirmedLastName?: string | null;
  nhlPlayerId?: number | null;
  identityCheckedAt?: string | null;
  identitySource?: string | null;
  goalies?: PhotoConfirmedGoalie[];
  goalieNamesPending?: boolean;
  identityCandidates?: Array<{
    nhlPlayerId: number;
    name: string;
    team: string;
    position: "F" | "D";
  }>;
};
export type DraftRoster = { id: string; name: string; selections: DraftSelection[] };

const namesNeedingClarification = new Set([
  "Smith", "Miller", "Jones", "Pettersson", "Kane", "Robertson",
  "Thompson", "Nylander", "Geekie", "Buium",
]);

export const draftRosters: DraftRoster[] = boards.map(board => ({
  id: board.id,
  name: board.name,
  selections: board.picks.map((pick, index) => {
    const prefix = pick.startsWith("D:") ? "D" : pick.startsWith("G:") ? "G" : "F";
    const originalText = prefix === "F" ? pick : pick.slice(2);
    let reviewNote: string | null = null;
    const confirmation = originalText === "Carlson"
      ? board.id === "cohen"
        ? { confirmedName: "John Carlson", confirmedTeam: "Washington Capitals" }
        : board.id === "weezbark"
          ? { confirmedName: "Leo Carlsson", confirmedTeam: "Anaheim Ducks" }
          : undefined
      : undefined;
    if (!confirmation && namesNeedingClarification.has(originalText)) {
      reviewNote = "Surname-only selection: confirm the player's full name before matching an NHL record.";
    }
    return {
      round: index + 1,
      originalText,
      assetType: prefix === "G" ? "goalieTeam" : "skater",
      position: prefix,
      reviewNote,
      ...confirmation,
    };
  }),
}));