export const DAILY_FACEOFF_TEAMS_URL = "https://www.dailyfaceoff.com/teams";

export type NhlLineTeam = {
  abbreviation: string;
  name: string;
  slug: string;
};

/**
 * All 32 current NHL clubs and their published Daily Faceoff URLs.
 * Verified against the source directory on 2026-10-01. Player combinations are
 * intentionally not copied: opening the source always shows its latest page.
 * This informational directory must never change pool scoring or ownership.
 */
export const NHL_LINE_TEAMS: readonly NhlLineTeam[] = [
  { abbreviation: "ANA", name: "Anaheim Ducks", slug: "anaheim-ducks" },
  { abbreviation: "BOS", name: "Boston Bruins", slug: "boston-bruins" },
  { abbreviation: "BUF", name: "Buffalo Sabres", slug: "buffalo-sabres" },
  { abbreviation: "CGY", name: "Calgary Flames", slug: "calgary-flames" },
  { abbreviation: "CAR", name: "Carolina Hurricanes", slug: "carolina-hurricanes" },
  { abbreviation: "CHI", name: "Chicago Blackhawks", slug: "chicago-blackhawks" },
  { abbreviation: "COL", name: "Colorado Avalanche", slug: "colorado-avalanche" },
  { abbreviation: "CBJ", name: "Columbus Blue Jackets", slug: "columbus-blue-jackets" },
  { abbreviation: "DAL", name: "Dallas Stars", slug: "dallas-stars" },
  { abbreviation: "DET", name: "Detroit Red Wings", slug: "detroit-red-wings" },
  { abbreviation: "EDM", name: "Edmonton Oilers", slug: "edmonton-oilers" },
  { abbreviation: "FLA", name: "Florida Panthers", slug: "florida-panthers" },
  { abbreviation: "LAK", name: "Los Angeles Kings", slug: "los-angeles-kings" },
  { abbreviation: "MIN", name: "Minnesota Wild", slug: "minnesota-wild" },
  { abbreviation: "MTL", name: "Montréal Canadiens", slug: "montreal-canadiens" },
  { abbreviation: "NSH", name: "Nashville Predators", slug: "nashville-predators" },
  { abbreviation: "NJD", name: "New Jersey Devils", slug: "new-jersey-devils" },
  { abbreviation: "NYI", name: "New York Islanders", slug: "new-york-islanders" },
  { abbreviation: "NYR", name: "New York Rangers", slug: "new-york-rangers" },
  { abbreviation: "OTT", name: "Ottawa Senators", slug: "ottawa-senators" },
  { abbreviation: "PHI", name: "Philadelphia Flyers", slug: "philadelphia-flyers" },
  { abbreviation: "PIT", name: "Pittsburgh Penguins", slug: "pittsburgh-penguins" },
  { abbreviation: "SJS", name: "San Jose Sharks", slug: "san-jose-sharks" },
  { abbreviation: "SEA", name: "Seattle Kraken", slug: "seattle-kraken" },
  { abbreviation: "STL", name: "St. Louis Blues", slug: "st-louis-blues" },
  { abbreviation: "TBL", name: "Tampa Bay Lightning", slug: "tampa-bay-lightning" },
  { abbreviation: "TOR", name: "Toronto Maple Leafs", slug: "toronto-maple-leafs" },
  { abbreviation: "UTA", name: "Utah Mammoth", slug: "utah-mammoth" },
  { abbreviation: "VAN", name: "Vancouver Canucks", slug: "vancouver-canucks" },
  { abbreviation: "VGK", name: "Vegas Golden Knights", slug: "vegas-golden-knights" },
  { abbreviation: "WSH", name: "Washington Capitals", slug: "washington-capitals" },
  { abbreviation: "WPG", name: "Winnipeg Jets", slug: "winnipeg-jets" },
];

export function getDailyFaceoffLineUrl(team: NhlLineTeam): string {
  return `${DAILY_FACEOFF_TEAMS_URL}/${encodeURIComponent(team.slug)}/line-combinations`;
}