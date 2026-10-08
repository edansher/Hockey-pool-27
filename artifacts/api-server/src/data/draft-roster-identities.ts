/**
 * Manual, pool-specific identity snapshot from official NHL 2026–27 club
 * rosters and standings, checked 2026-10-01. Keys are the unchanged source
 * owner/round/original label; the original pick data remains in draft-rosters.
 *
 * The eight formerly ambiguous picks below were resolved from the pool
 * creator's photo confirmation in attached_assets/IMG_2990_1790863200161.jpg,
 * IMG_2992_1790863221234.jpg, and IMG_2993_1790863237293.jpg. Their IDs,
 * names, and teams come from the existing Oct. 1 candidate snapshot; NHL
 * profile URLs are rendered from its existing profile URL template. The
 * photos are identity evidence, not a new NHL fetch and do not change
 * NHL_IDENTITY_CHECKED_AT.
 */
export const NHL_IDENTITY_CHECKED_AT = "2026-10-01T07:53:37.573Z";
export const NHL_ROSTER_SOURCE_TEMPLATE =
  "https://api-web.nhle.com/v1/roster/{teamAbbreviation}/20262027";
export const NHL_STANDINGS_SOURCE =
  "https://api-web.nhle.com/v1/standings/now";
export const NHL_PLAYER_LANDING_SOURCE_TEMPLATE =
  "https://api-web.nhle.com/v1/player/{nhlPlayerId}/landing";
export const NHL_PLAYER_SEARCH_SOURCE =
  "https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=10&q=";

export const NHL_TEAM_NAMES: Record<string, string> = {
  ANA: "Anaheim Ducks",
  BOS: "Boston Bruins",
  BUF: "Buffalo Sabres",
  CGY: "Calgary Flames",
  CAR: "Carolina Hurricanes",
  CHI: "Chicago Blackhawks",
  COL: "Colorado Avalanche",
  CBJ: "Columbus Blue Jackets",
  DAL: "Dallas Stars",
  DET: "Detroit Red Wings",
  EDM: "Edmonton Oilers",
  FLA: "Florida Panthers",
  LAK: "Los Angeles Kings",
  MIN: "Minnesota Wild",
  MTL: "Montréal Canadiens",
  NSH: "Nashville Predators",
  NJD: "New Jersey Devils",
  NYI: "New York Islanders",
  NYR: "New York Rangers",
  OTT: "Ottawa Senators",
  PHI: "Philadelphia Flyers",
  PIT: "Pittsburgh Penguins",
  SJS: "San Jose Sharks",
  SEA: "Seattle Kraken",
  STL: "St. Louis Blues",
  TBL: "Tampa Bay Lightning",
  TOR: "Toronto Maple Leafs",
  UTA: "Utah Mammoth",
  VAN: "Vancouver Canucks",
  VGK: "Vegas Golden Knights",
  WSH: "Washington Capitals",
  WPG: "Winnipeg Jets",
};

type PlayerRow = [
  ownerId: string,
  round: number,
  originalText: string,
  nhlPlayerId: number,
  confirmedName: string,
  confirmedLastName: string,
  teamAbbreviation: string,
  landingSearch?: string,
];

/** [owner, round, exact originalText, official id, full name, last name, club, search query?] */
const playerRows: PlayerRow[] = [
  ["cohen", 1, "McDavid", 8478402, "Connor McDavid", "McDavid", "EDM"],
  ["cohen", 2, "Caufield", 8481540, "Cole Caufield", "Caufield", "MTL"],
  ["cohen", 3, "Connor", 8478398, "Kyle Connor", "Connor", "WPG"],
  ["cohen", 4, "Point", 8478010, "Brayden Point", "Point", "TBL"],
  ["cohen", 5, "Reinhart", 8477933, "Sam Reinhart", "Reinhart", "FLA"],
  ["cohen", 6, "Carlson", 8474590, "John Carlson", "Carlson", "TBL", "John Carlson"],
  ["cohen", 7, "Hintz", 8478449, "Roope Hintz", "Hintz", "DAL"],
  ["cohen", 8, "Larkin", 8477946, "Dylan Larkin", "Larkin", "DET"],
  ["cohen", 9, "Seider", 8481542, "Moritz Seider", "Seider", "DET"],
  ["cohen", 10, "Hyman", 8475786, "Zach Hyman", "Hyman", "EDM"],
  ["cohen", 11, "Nugent-Hopkins", 8476454, "Ryan Nugent-Hopkins", "Nugent-Hopkins", "EDM"],
  ["cohen", 13, "Martone", 8485406, "Porter Martone", "Martone", "PHI"],
  ["cohen", 14, "Harley", 8481581, "Thomas Harley", "Harley", "DAL"],
  ["cohen", 15, "Duchene", 8475168, "Matt Duchene", "Duchene", "DAL"],
  ["cohen", 16, "Jones", 8477495, "Seth Jones", "Jones", "FLA"],
  ["cohen", 17, "Frondell", 8485391, "Anton Frondell", "Frondell", "CHI"],
  ["cohen", 20, "C. Hutson", 8484873, "Cole Hutson", "Hutson", "WSH"],

  ["weezbark", 1, "MacKinnon", 8477492, "Nathan MacKinnon", "MacKinnon", "COL"],
  ["weezbark", 2, "Rantanen", 8478420, "Mikko Rantanen", "Rantanen", "DAL"],
  ["weezbark", 3, "L. Hutson", 8483457, "Lane Hutson", "Hutson", "MTL"],
  ["weezbark", 4, "Carlson", 8484153, "Leo Carlsson", "Carlsson", "ANA", "Leo Carlsson"],
  ["weezbark", 5, "Demidov", 8484984, "Ivan Demidov", "Demidov", "MTL"],
  ["weezbark", 6, "Cooley", 8483431, "Logan Cooley", "Cooley", "UTA"],
  ["weezbark", 7, "Marchenko", 8480893, "Kirill Marchenko", "Marchenko", "TOR"],
  ["weezbark", 8, "Tuch", 8477949, "Alex Tuch", "Tuch", "WSH"],
  ["weezbark", 9, "Batherson", 8480208, "Drake Batherson", "Batherson", "OTT"],
  ["weezbark", 11, "McKenna", 8486067, "Gavin McKenna", "McKenna", "TOR"],
  ["weezbark", 12, "Kyrou", 8479385, "Jordan Kyrou", "Kyrou", "WSH"],
  ["weezbark", 13, "McAvoy", 8479325, "Charlie McAvoy", "McAvoy", "BOS"],
  ["weezbark", 14, "Nelson", 8475754, "Brock Nelson", "Nelson", "COL"],
  ["weezbark", 15, "Bedard", 8484144, "Connor Bedard", "Bedard", "CHI", "Bedard"],
  ["weezbark", 16, "Faber", 8482122, "Brock Faber", "Faber", "MIN"],
  ["weezbark", 17, "A. Protas", 8481656, "Aliaksei Protas", "Protas", "WSH"],
  ["weezbark", 19, "Toews", 8478038, "Devon Toews", "Toews", "COL"],
  ["weezbark", 20, "Andersson", 8478397, "Rasmus Andersson", "Andersson", "VGK"],

  ["rob", 1, "Draisatl", 8477934, "Leon Draisaitl", "Draisaitl", "EDM"],
  ["rob", 2, "Suzuki", 8480018, "Nick Suzuki", "Suzuki", "MTL"],
  ["rob", 3, "Schiefele", 8476460, "Mark Scheifele", "Scheifele", "WPG"],
  ["rob", 4, "Barkov", 8477493, "Aleksander Barkov", "Barkov", "FLA"],
  ["rob", 5, "Debrincat", 8479337, "Alex DeBrincat", "DeBrincat", "DET"],
  ["rob", 6, "Raymond", 8482078, "Lucas Raymond", "Raymond", "DET"],
  ["rob", 7, "Forsberg", 8476887, "Filip Forsberg", "Forsberg", "NSH"],
  ["rob", 9, "Morrissey", 8477504, "Josh Morrissey", "Morrissey", "WPG"],
  ["rob", 11, "LaCombe", 8481605, "Jackson LaCombe", "LaCombe", "ANA"],
  ["rob", 12, "Hedman", 8475167, "Victor Hedman", "Hedman", "TBL"],
  ["rob", 13, "E. Karlsson", 8474578, "Erik Karlsson", "Karlsson", "PIT"],
  ["rob", 14, "Barzal", 8478445, "Mathew Barzal", "Barzal", "NYI", "Barzal"],
  ["rob", 15, "Gostisbehere", 8476906, "Shayne Gostisbehere", "Gostisbehere", "CAR"],
  ["rob", 16, "Zuccarello", 8475692, "Mats Zuccarello", "Zuccarello", "LAK"],
  ["rob", 17, "Hertl", 8476881, "Tomas Hertl", "Hertl", "VGK"],
  ["rob", 18, "Trochek", 8476389, "Vincent Trocheck", "Trocheck", "UTA", "Trocheck"],
  ["rob", 19, "Zacha", 8478401, "Pavel Zacha", "Zacha", "BOS"],
  ["rob", 20, "Boeser", 8478444, "Brock Boeser", "Boeser", "VAN"],

  ["korm", 1, "Kucherow", 8476453, "Nikita Kucherov", "Kucherov", "TBL"],
  ["korm", 2, "Matthews", 8479318, "Auston Matthews", "Matthews", "TOR"],
  ["korm", 3, "Marner", 8478483, "Mitch Marner", "Marner", "VGK"],
  ["korm", 4, "Keller", 8479343, "Clayton Keller", "Keller", "UTA"],
  ["korm", 5, "Dahlin", 8480839, "Rasmus Dahlin", "Dahlin", "BUF"],
  ["korm", 6, "Zibanejad", 8476459, "Mika Zibanejad", "Zibanejad", "NYR"],
  ["korm", 7, "Bratt", 8479407, "Jesper Bratt", "Bratt", "NJD"],
  ["korm", 8, "Schmaltz", 8477951, "Nick Schmaltz", "Schmaltz", "UTA"],
  ["korm", 9, "Hishchier", 8480002, "Nico Hischier", "Hischier", "NJD"],
  ["korm", 10, "Valaridi", 8480014, "Gabriel Vilardi", "Vilardi", "WPG", "Vilardi"],
  ["korm", 11, "Zegras", 8481533, "Trevor Zegras", "Zegras", "PHI"],
  ["korm", 12, "W. Karlsson", 8476448, "William Karlsson", "Karlsson", "VGK"],
  ["korm", 14, "Stamkos", 8474564, "Steven Stamkos", "Stamkos", "NSH"],
  ["korm", 15, "Kreider", 8475184, "Chris Kreider", "Kreider", "MTL"],
  ["korm", 16, "Hamilton", 8476462, "Dougie Hamilton", "Hamilton", "NJD"],
  ["korm", 17, "Weegar", 8477346, "MacKenzie Weegar", "Weegar", "UTA"],
  ["korm", 19, "Power", 8482671, "Owen Power", "Power", "BUF"],
  ["korm", 20, "Trouba", 8476885, "Jacob Trouba", "Trouba", "SJS"],

  ["edan", 1, "Kaprizov", 8478864, "Kirill Kaprizov", "Kaprizov", "MIN"],
  ["edan", 3, "Boldy", 8481557, "Matt Boldy", "Boldy", "MIN"],
  ["edan", 4, "Stuzle", 8482116, "Tim Stützle", "Stützle", "OTT"],
  ["edan", 5, "Guenther", 8482699, "Dylan Guenther", "Guenther", "UTA"],
  ["edan", 6, "Fox", 8479323, "Adam Fox", "Fox", "NYR"],
  ["edan", 7, "Slafkovsky", 8483515, "Juraj Slafkovský", "Slafkovský", "MTL"],
  ["edan", 9, "Dorefoev", 8481604, "Pavel Dorofeyev", "Dorofeyev", "NYR", "Dorofeyev"],
  ["edan", 10, "Sergachev", 8479410, "Mikhail Sergachev", "Sergachev", "UTA"],
  ["edan", 11, "Peterka", 8482175, "JJ Peterka", "Peterka", "BOS"],
  ["edan", 13, "Clarke", 8482730, "Brandt Clarke", "Clarke", "LAK"],
  ["edan", 15, "Erikkson Ek", 8478493, "Joel Eriksson Ek", "Eriksson Ek", "MIN"],
  ["edan", 16, "L. Hughes", 8482684, "Luke Hughes", "Hughes", "NJD"],
  ["edan", 17, "Hronek", 8479425, "Filip Hronek", "Hronek", "VAN"],
  ["edan", 18, "Benson", 8484145, "Zach Benson", "Benson", "BUF"],
  ["edan", 19, "Cozens", 8481528, "Dylan Cozens", "Cozens", "OTT"],

  ["joe", 1, "Celebrini", 8484801, "Macklin Celebrini", "Celebrini", "SJS"],
  ["joe", 2, "Necas", 8480039, "Martin Necas", "Necas", "COL"],
  ["joe", 3, "Nylander", 8477939, "William Nylander", "Nylander", "TOR"],
  ["joe", 4, "M. Tkachuk", 8479314, "Matthew Tkachuk", "Tkachuk", "FLA"],
  ["joe", 5, "C. Gauthier", 8483445, "Cutter Gauthier", "Gauthier", "ANA"],
  ["joe", 6, "Raddysh", 8478178, "Darren Raddysh", "Raddysh", "TOR"],
  ["joe", 8, "Thomas", 8480023, "Robert Thomas", "Thomas", "STL"],
  ["joe", 9, "Sencke", 8484762, "Beckett Sennecke", "Sennecke", "ANA", "Sennecke"],
  ["joe", 10, "Byram", 8481524, "Bowen Byram", "Byram", "CHI"],
  ["joe", 12, "D. Strome", 8478440, "Dylan Strome", "Strome", "WSH"],
  ["joe", 13, "Theordre", 8477447, "Shea Theodore", "Theodore", "VGK", "Theodore"],
  ["joe", 14, "Ovechkin", 8471214, "Alex Ovechkin", "Ovechkin", "WSH"],
  ["joe", 15, "Montour", 8477986, "Brandon Montour", "Montour", "SEA"],
  ["joe", 16, "Snuggerud", 8483516, "Jimmy Snuggerud", "Snuggerud", "STL"],
  ["joe", 17, "Byfield", 8482124, "Quinton Byfield", "Byfield", "LAK"],
  ["joe", 19, "Stankoven", 8482702, "Logan Stankoven", "Stankoven", "CAR"],
  ["joe", 20, "Nemec", 8483495, "Simon Nemec", "Nemec", "CGY"],

  ["drb-and-son", 1, "Pasternak", 8477956, "David Pastrnak", "Pastrnak", "BOS"],
  ["drb-and-son", 2, "Eichel", 8478403, "Jack Eichel", "Eichel", "VGK"],
  ["drb-and-son", 3, "J. Hughes", 8481559, "Jack Hughes", "Hughes", "NJD"],
  ["drb-and-son", 4, "Aho", 8478427, "Sebastian Aho", "Aho", "CAR"],
  ["drb-and-son", 5, "Schaeffer", 8485366, "Matthew Schaefer", "Schaefer", "NYI"],
  ["drb-and-son", 7, "Heiskanen", 8480036, "Miro Heiskanen", "Heiskanen", "DAL"],
  ["drb-and-son", 8, "Svechnikov", 8480830, "Andrei Svechnikov", "Svechnikov", "CAR"],
  ["drb-and-son", 9, "Josi", 8474600, "Roman Josi", "Josi", "NSH"],
  ["drb-and-son", 10, "Mitchkov", 8484387, "Matvei Michkov", "Michkov", "PHI"],
  ["drb-and-son", 11, "Stenberg", 8486103, "Ivar Stenberg", "Stenberg", "SJS"],
  ["drb-and-son", 12, "Stone", 8475913, "Mark Stone", "Stone", "VGK"],
  ["drb-and-son", 14, "McMann", 8482259, "Bobby McMann", "McMann", "SEA"],
  ["drb-and-son", 15, "Matheson", 8476875, "Mike Matheson", "Matheson", "MTL"],
  ["drb-and-son", 17, "Cirelli", 8478519, "Anthony Cirelli", "Cirelli", "TBL"],
  ["drb-and-son", 18, "Rielly", 8476853, "Morgan Rielly", "Rielly", "TOR"],
  ["drb-and-son", 19, "Cowan", 8484158, "Easton Cowan", "Cowan", "TOR"],
  ["drb-and-son", 20, "Machielli", 8481711, "Matias Maccelli", "Maccelli", "NYI", "Maccelli"],

  ["nana", 1, "Panarin", 8478550, "Artemi Panarin", "Panarin", "LAK"],
  ["nana", 2, "Makar", 8480069, "Cale Makar", "Makar", "COL"],
  ["nana", 3, "Guentzel", 8477404, "Jake Guentzel", "Guentzel", "TBL"],
  ["nana", 4, "Werenski", 8478460, "Zach Werenski", "Werenski", "CBJ"],
  ["nana", 5, "Crosby", 8471675, "Sidney Crosby", "Crosby", "PIT"],
  ["nana", 6, "Hagel", 8479542, "Brandon Hagel", "Hagel", "TBL"],
  ["nana", 7, "Tavares", 8475166, "John Tavares", "Tavares", "TOR"],
  ["nana", 8, "Kempe", 8477960, "Adrian Kempe", "Kempe", "LAK"],
  ["nana", 9, "Konecny", 8478439, "Travis Konecny", "Konecny", "PHI"],
  ["nana", 10, "Chychrun", 8479345, "Jakob Chychrun", "Chychrun", "WSH"],
  ["nana", 11, "Fantili", 8484166, "Adam Fantilli", "Fantilli", "CBJ"],
  ["nana", 14, "Holloway", 8482077, "Dylan Holloway", "Holloway", "STL"],
  ["nana", 15, "Rust", 8475810, "Bryan Rust", "Rust", "PIT"],
  ["nana", 16, "Knies", 8482720, "Matthew Knies", "Knies", "CBJ"],
  ["nana", 17, "Buium", 8484798, "Zeev Buium", "Buium", "VAN"],
  ["nana", 19, "Ekblad", 8477932, "Aaron Ekblad", "Ekblad", "FLA"],
  ["nana", 20, "Malkin", 8471215, "Evgeni Malkin", "Malkin", "PIT"],

  ["jimmy", 2, "Bouchard", 8480803, "Evan Bouchard", "Bouchard", "EDM"],
  ["jimmy", 3, "Q. Hughes", 8480800, "Quinn Hughes", "Hughes", "MIN"],
  ["jimmy", 4, "Thompson", 8479420, "Tage Thompson", "Thompson", "BUF"],
  ["jimmy", 5, "B. Tkachuk", 8480801, "Brady Tkachuk", "Tkachuk", "FLA"],
  ["jimmy", 7, "Ehlers", 8477940, "Nikolaj Ehlers", "Ehlers", "CAR"],
  ["jimmy", 8, "Kane", 8474141, "Patrick Kane", "Kane", "CHI"],
  ["jimmy", 9, "Sanderson", 8482105, "Jake Sanderson", "Sanderson", "OTT"],
  ["jimmy", 10, "Horvat", 8477500, "Bo Horvat", "Horvat", "NYI"],
  ["jimmy", 11, "O'Reilly", 8475158, "Ryan O'Reilly", "O'Reilly", "NSH"],
  ["jimmy", 12, "Bennett", 8477935, "Sam Bennett", "Bennett", "FLA"],
  ["jimmy", 13, "Dobson", 8480865, "Noah Dobson", "Dobson", "MTL"],
  ["jimmy", 14, "Jarvis", 8482093, "Seth Jarvis", "Jarvis", "CAR", "Jarvis"],
  ["jimmy", 16, "Verhaghe", 8477409, "Carter Verhaeghe", "Verhaeghe", "FLA"],
  ["jimmy", 17, "Kadri", 8475172, "Nazem Kadri", "Kadri", "COL"],
  ["jimmy", 18, "Dunn", 8478407, "Vince Dunn", "Dunn", "SEA"],
  ["jimmy", 19, "Coyle", 8475745, "Charlie Coyle", "Coyle", "CBJ"],
  ["jimmy", 20, "Coleman", 8476399, "Blake Coleman", "Coleman", "MIN"],
  ["cohen", 18, "Pettersson", 8480012, "Elias Pettersson", "Pettersson", "VAN", "Elias Pettersson"],
  ["edan", 2, "Johnston", 8482740, "Wyatt Johnston", "Johnston", "DAL", "Wyatt Johnston"],
  ["edan", 8, "Smith", 8484227, "Will Smith", "Smith", "SJS", "Will Smith"],
  ["edan", 14, "Miller", 8476468, "J.T. Miller", "Miller", "NYR", "J.T. Miller"],
  ["joe", 11, "Wilson", 8476880, "Tom Wilson", "Wilson", "WSH", "Tom Wilson"],
  ["drb-and-son", 16, "Eklund", 8482667, "William Eklund", "Eklund", "OTT", "William Eklund"],
  ["nana", 13, "Geekie", 8479987, "Morgan Geekie", "Geekie", "BOS", "Morgan Geekie"],
  ["jimmy", 1, "Robertson", 8480027, "Jason Robertson", "Robertson", "DAL", "Jason Robertson"],
];

type GoalkeeperTeamRow = [
  ownerId: string,
  round: number,
  originalText: string,
  teamAbbreviation: string,
];

const goalieTeamRows: GoalkeeperTeamRow[] = [
  ["cohen", 12, "EDM", "EDM"],
  ["cohen", 19, "UTAH", "UTA"],
  ["weezbark", 10, "Was", "WSH"],
  ["weezbark", 18, "ANA", "ANA"],
  ["rob", 8, "Dallas", "DAL"],
  ["rob", 10, "Minny", "MIN"],
  ["korm", 13, "TOR", "TOR"],
  ["korm", 18, "NYR", "NYR"],
  ["edan", 12, "MTL", "MTL"],
  ["edan", 20, "BUF", "BUF"],
  ["joe", 7, "Colorado", "COL"],
  ["joe", 18, "SJS", "SJS"],
  ["drb-and-son", 6, "Carolina", "CAR"],
  ["drb-and-son", 13, "BOS", "BOS"],
  ["nana", 12, "FLA", "FLA"],
  ["nana", 18, "VGK", "VGK"],
  ["jimmy", 6, "Tampa", "TBL"],
  ["jimmy", 15, "NYI", "NYI"],
];

const keyOf = (ownerId: string, round: number, originalText: string) =>
  `${ownerId}:${round}:${originalText}`;

export type DraftIdentitySnapshotEntry =
  | {
      kind: "player";
      nhlPlayerId: number;
      confirmedName: string;
      confirmedLastName: string;
      confirmedTeam: string;
      sourceUrl: string;
    }
  | {
      kind: "ambiguous";
      candidates: Array<{
        nhlPlayerId: number;
        name: string;
        team: string;
        position: "F" | "D";
      }>;
      sourceUrl: string;
    }
  | {
      kind: "goalieTeam";
      confirmedTeam: string;
      sourceUrl: string;
    };

function sourceForPlayer(
  nhlPlayerId: number,
  teamAbbreviation: string,
  landingSearch?: string,
): string {
  const base = landingSearch
    ? `${NHL_PLAYER_LANDING_SOURCE_TEMPLATE.replace("{nhlPlayerId}", String(nhlPlayerId))}; ${NHL_PLAYER_SEARCH_SOURCE}${encodeURIComponent(landingSearch)}`
    : NHL_ROSTER_SOURCE_TEMPLATE.replace("{teamAbbreviation}", teamAbbreviation);
  return `${base}; ${NHL_STANDINGS_SOURCE}`;
}

const entries = new Map<string, DraftIdentitySnapshotEntry>();

function addEntry(key: string, entry: DraftIdentitySnapshotEntry) {
  if (entries.has(key)) throw new Error(`Duplicate draft identity snapshot key: ${key}`);
  entries.set(key, entry);
}

for (const [
  ownerId, round, originalText, nhlPlayerId, confirmedName,
  confirmedLastName, teamAbbreviation, landingSearch,
] of playerRows) {
  const confirmedTeam = NHL_TEAM_NAMES[teamAbbreviation];
  if (!confirmedTeam) throw new Error(`Unknown NHL abbreviation in identity snapshot: ${teamAbbreviation}`);
  addEntry(keyOf(ownerId, round, originalText), {
    kind: "player",
    nhlPlayerId,
    confirmedName,
    confirmedLastName,
    confirmedTeam,
    sourceUrl: sourceForPlayer(nhlPlayerId, teamAbbreviation, landingSearch),
  });
}

for (const [ownerId, round, originalText, teamAbbreviation] of goalieTeamRows) {
  const confirmedTeam = NHL_TEAM_NAMES[teamAbbreviation];
  if (!confirmedTeam) throw new Error(`Unknown NHL abbreviation in goalie-team snapshot: ${teamAbbreviation}`);
  addEntry(keyOf(ownerId, round, originalText), {
    kind: "goalieTeam",
    confirmedTeam,
    sourceUrl: NHL_STANDINGS_SOURCE,
  });
}

if (playerRows.length !== 162 || goalieTeamRows.length !== 18) {
  throw new Error("The official draft identity snapshot must cover 162 confirmed skaters and 18 goalie teams.");
}
if (!Number.isFinite(Date.parse(NHL_IDENTITY_CHECKED_AT))) {
  throw new Error("The NHL identity snapshot has an invalid checked-at date.");
}

function validateSourceUrls(value: string, key: string) {
  if (!value.trim()) throw new Error(`Missing NHL source URL for ${key}.`);
  for (const sourceUrl of value.split("; ")) {
    try {
      const parsed = new URL(sourceUrl);
      if (parsed.protocol !== "https:") throw new Error("Expected HTTPS.");
    } catch {
      throw new Error(`Invalid NHL source URL for ${key}: ${sourceUrl}`);
    }
  }
}

function validateSnapshotOnLoad() {
  if (entries.size !== 180) {
    throw new Error(`Expected 180 exact-source identity records; got ${entries.size}.`);
  }
  for (const [key, entry] of entries) {
    if (!/^[^:]+:\d+:.+$/.test(key)) {
      throw new Error(`Invalid owner/round/original-label identity key: ${key}`);
    }
    validateSourceUrls(entry.sourceUrl, key);
    if (entry.kind === "player") {
      if (!Number.isInteger(entry.nhlPlayerId) || entry.nhlPlayerId <= 0 ||
        !entry.confirmedName.trim() || !entry.confirmedLastName.trim() ||
        !entry.confirmedTeam.trim()) {
        throw new Error(`Invalid confirmed NHL identity in snapshot: ${key}`);
      }
    } else if (entry.kind === "ambiguous") {
      if (entry.candidates.length < 2 || entry.candidates.some(candidate =>
        !Number.isInteger(candidate.nhlPlayerId) || candidate.nhlPlayerId <= 0 ||
        !candidate.name.trim() || !candidate.team.trim() ||
        (candidate.position !== "F" && candidate.position !== "D"),
      )) {
        throw new Error(`Invalid or insufficient NHL identity candidates in snapshot: ${key}`);
      }
    } else if (!entry.confirmedTeam.trim()) {
      throw new Error(`Invalid official goalie-team metadata in snapshot: ${key}`);
    }
  }
}
validateSnapshotOnLoad();

export const draftIdentitySnapshot: ReadonlyMap<string, DraftIdentitySnapshotEntry> = entries;

export function identitySnapshotKey(ownerId: string, round: number, originalText: string) {
  return keyOf(ownerId, round, originalText);
}