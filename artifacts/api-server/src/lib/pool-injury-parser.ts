export const NHL_PROJECTION_URL =
  "https://www.nhl.com/news/nhl-lineup-projections-2026-27-season";
export const ESPN_INJURIES_URL = "https://www.espn.com/nhl/injuries";
export const ESPN_INJURY_DATA_URL =
  "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries";
export const CBS_INJURIES_URL = "https://www.cbssports.com/nhl/injuries/";
export const NHL_INJURY_TIMEZONE = "America/Toronto";
export const NHL_INJURY_REFRESH_HOUR = 8;

export interface InjuryIdentity {
  nhlPlayerId: number;
  name: string;
  team: string | null;
}

export interface ParsedInjuryEvidence {
  injuries: Map<number, { details: string; sourceUrl: string; reportedAt: string }>;
  availableIds: Set<number>;
  availableAt: Map<number, string>;
  reports: number;
}

export interface OfficialArticle {
  body: string;
  url: string;
  publishedAt: string;
}

export interface InjuryFeedRow {
  name: string;
  team: string;
  status: "injured" | "not_reported_injured" | "unknown";
  details: string;
  reportedAt?: string | null;
}

export interface ParsedInjuryFeed {
  rows: InjuryFeedRow[];
  sourceReports: number;
  coveredTeams: number;
  coveredTeamCodes?: string[];
  complete?: boolean;
}

/** @deprecated Retained for consumers of the former ESPN parser API. */
export type EspnInjuryRow = InjuryFeedRow;
/** @deprecated Retained for consumers of the former ESPN parser API. */
export type ParsedEspnInjuryFeed = ParsedInjuryFeed;

const TEAM_NAMES: Record<string, string> = {
  "Anaheim Ducks": "ANA", "Boston Bruins": "BOS", "Buffalo Sabres": "BUF",
  "Calgary Flames": "CGY", "Carolina Hurricanes": "CAR", "Chicago Blackhawks": "CHI",
  "Colorado Avalanche": "COL", "Columbus Blue Jackets": "CBJ", "Dallas Stars": "DAL",
  "Detroit Red Wings": "DET", "Edmonton Oilers": "EDM", "Florida Panthers": "FLA",
  "Los Angeles Kings": "LAK", "Minnesota Wild": "MIN", "Montreal Canadiens": "MTL",
  "Nashville Predators": "NSH", "New Jersey Devils": "NJD", "New York Islanders": "NYI",
  "New York Rangers": "NYR", "Ottawa Senators": "OTT", "Philadelphia Flyers": "PHI",
  "Pittsburgh Penguins": "PIT", "San Jose Sharks": "SJS", "Seattle Kraken": "SEA",
  "St. Louis Blues": "STL", "Tampa Bay Lightning": "TBL", "Toronto Maple Leafs": "TOR",
  "Utah Mammoth": "UTA", "Vancouver Canucks": "VAN", "Vegas Golden Knights": "VGK",
  "Washington Capitals": "WSH", "Winnipeg Jets": "WPG",
  "Ducks": "ANA", "Bruins": "BOS", "Sabres": "BUF", "Flames": "CGY",
  "Hurricanes": "CAR", "Blackhawks": "CHI", "Avalanche": "COL",
  "Blue Jackets": "CBJ", "Stars": "DAL", "Red Wings": "DET", "Oilers": "EDM",
  "Panthers": "FLA", "Kings": "LAK", "Wild": "MIN", "Canadiens": "MTL",
  "Predators": "NSH", "Devils": "NJD", "Islanders": "NYI", "Rangers": "NYR",
  "Senators": "OTT", "Flyers": "PHI", "Penguins": "PIT", "Sharks": "SJS",
  "Kraken": "SEA", "Blues": "STL", "Lightning": "TBL", "Maple Leafs": "TOR",
  "Mammoth": "UTA", "Canucks": "VAN", "Golden Knights": "VGK",
  "Capitals": "WSH", "Jets": "WPG",
};
const TEAM_CODE_ALIASES: Record<string, string> = {
  LA: "LAK",
  NJ: "NJD",
  SJ: "SJS",
  TB: "TBL",
  CLB: "CBJ",
  MON: "MTL",
  LV: "VGK",
  WAS: "WSH",
};

function clean(value: string): string {
  return value.replace(/&amp;/gi, "&").replace(/&#x27;|&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"').replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function dateString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function parseOfficialNhlArticle(
  html: string,
  url: string,
  now: Date,
): OfficialArticle | null {
  const scripts = [...html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld(?:\+|&#x0*2b;|&#0*43;|&plus;)json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    try {
      const parsed: unknown = JSON.parse(match[1]!.trim());
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== "object") continue;
        const record = candidate as Record<string, unknown>;
        const article = Array.isArray(record["@graph"]) ? record["@graph"] : [record];
        for (const entry of article) {
          if (!entry || typeof entry !== "object") continue;
          const data = entry as Record<string, unknown>;
          if (typeof data.articleBody !== "string" || !data.articleBody.trim()) continue;
          const publishedAt = dateString(data.datePublished);
          if (!publishedAt || Date.parse(publishedAt) > now.getTime() + 5 * 60_000) continue;
          const modifiedAt = dateString(data.dateModified);
          const evidenceAt = modifiedAt && Date.parse(modifiedAt) >= Date.parse(publishedAt) &&
            Date.parse(modifiedAt) <= now.getTime() + 5 * 60_000 ? modifiedAt : publishedAt;
          return { body: data.articleBody, url, publishedAt: evidenceAt };
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

function resolveIdentity(
  name: string,
  team: string,
  identities: readonly InjuryIdentity[],
): InjuryIdentity | null {
  const normalizedName = normalizePlayerName(name);
  const normalizedTeam = teamCode(team);
  const matches = identities.filter(identity =>
    normalizePlayerName(identity.name) === normalizedName &&
    teamCode(identity.team) === normalizedTeam,
  );
  return matches.length === 1 ? matches[0]! : null;
}

function normalizePlayerName(name: string) {
  return clean(name).normalize("NFD").replace(/\p{M}/gu, "").replace(/[’‘]/g, "'").toLocaleLowerCase("en");
}

function teamCode(name: string | null | undefined) {
  const normalized = (name ?? "").normalize("NFD").replace(/\p{M}/gu, "").trim().toLocaleLowerCase("en");
  const shortCode = TEAM_CODE_ALIASES[normalized.toUpperCase()];
  if (shortCode) return shortCode;
  return Object.entries(TEAM_NAMES).find(([nickname, code]) =>
    normalized === code.toLocaleLowerCase("en") ||
    normalized === nickname.toLocaleLowerCase("en") ||
    normalized.endsWith(` ${nickname.toLocaleLowerCase("en")}`),
  )?.[1] ?? null;
}

function projectionEvidence(
  article: OfficialArticle,
  identities: readonly InjuryIdentity[],
): ParsedInjuryEvidence {
  const injuries = new Map<number, { details: string; sourceUrl: string; reportedAt: string }>();
  const availableIds = new Set<number>();
  const availableAt = new Map<number, string>();
  const body = article.body;
  const sectionRegex = /\*\*([^*\n]+?) projected lineup\*\*([\s\S]*?)(?=\n\*\*[^*\n]+? projected lineup\*\*|$)/gi;
  for (const sectionMatch of body.matchAll(sectionRegex)) {
    const teamName = clean(sectionMatch[1]!);
    const team = TEAM_NAMES[teamName];
    if (!team) continue;
    const section = sectionMatch[2]!;
    // Only the explicit Injured subsection is injury evidence.
    const injuredMatch = section.match(/\*{2,3}Injured:\*{1,2}\s*([^*\n]+?)(?:\*|$)/i);
    if (injuredMatch) {
      for (const entry of injuredMatch[1]!.split(/,\s*(?=[A-Z])/)) {
        const parsed = clean(entry).match(/^(.+?)(?:\s*\(([^()]*)\))?$/);
        if (!parsed) continue;
        const identity = resolveIdentity(parsed[1]!, team, identities);
        if (identity) injuries.set(identity.nhlPlayerId, {
          details: parsed[2]?.trim() || "Listed as injured in the NHL projected lineup.",
          sourceUrl: article.url,
          reportedAt: article.publishedAt,
        });
      }
    }
    // Appearance in the actual projected lineup is positive availability evidence.
    const lineupText = section.split(/\b(?:Scratched|Injured|Status report)\b/i)[0] ?? "";
    for (const identity of identities) {
      if (teamCode(identity.team) !== team) continue;
      const escaped = identity.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(?:^|[^\\p{L}])${escaped}(?:$|[^\\p{L}])`, "iu").test(lineupText)) {
        availableIds.add(identity.nhlPlayerId);
        availableAt.set(identity.nhlPlayerId, article.publishedAt);
      }
    }
  }
  return { injuries, availableIds, availableAt, reports: 1 };
}

function statusReportEvidence(
  article: OfficialArticle,
  identities: readonly InjuryIdentity[],
): ParsedInjuryEvidence {
  const injuries = new Map<number, { details: string; sourceUrl: string; reportedAt: string }>();
  const availableIds = new Set<number>();
  const availableAt = new Map<number, string>();
  // NHL player IDs in official hyperlinks avoid ambiguous name/surname matching.
  for (const match of article.body.matchAll(/\[([^\]]+)\]\(https?:\/\/www\.nhl\.com\/player\/(?:[^)\s]*?-)?(\d+)(?:[?#][^)]*)?\)([^.\n]{0,180})/gi)) {
    const id = Number(match[2]);
    const identity = identities.find(item => item.nhlPlayerId === id);
    if (!identity) continue;
    const context = clean(`${match[1]} ${match[3]}`);
    if (/\b(expected to play|will play|made (?:his|her) (?:season|preseason) debut|returned to (?:the )?lineup|activated from (?:injured reserve|ir))\b/i.test(context)) {
      availableIds.add(id);
      availableAt.set(id, article.publishedAt);
      continue;
    }
    // A possible near-future return is evidence that the player is still out,
    // not evidence that he has become available.
    if (/\b(could return|may return|might return|expected to return)\b/i.test(context)) {
      injuries.set(id, {
        details: context.slice(identity.name.length).trim().replace(/^[,;:)\s]+/, "") ||
          "Official report says the player could return soon.",
        sourceUrl: article.url,
        reportedAt: article.publishedAt,
      });
      continue;
    }
    const explicitInjury = /\b(placed on (?:long-term )?injured reserve|injured reserve|out with [\w -]*injur|sidelined with|will miss .*? due to|injury update)\b/i.test(context);
    const currentAbsence = /\b(out (?:week to week|indefinitely|for)|is week to week|is day to day|will miss|will not play|being evaluated)\b/i.test(context);
    const physicalInjury = /\b(injur\w*|lower[- ]body|upper[- ]body|concussion|fractur\w*|surgery|shoulder|knee|hip)\b/i.test(context);
    if (explicitInjury || (currentAbsence && physicalInjury)) {
      injuries.set(id, {
        details: context.slice(identity.name.length).trim().replace(/^[,;:)\s]+/, "") ||
          "Listed in an official NHL status report.",
        sourceUrl: article.url,
        reportedAt: article.publishedAt,
      });
    }
  }

  // Some NHL status reports publish plain Markdown names instead of player
  // links. Resolve only an exact full name within its explicit club section.
  const headings = [...article.body.matchAll(/(?:^|\n)##\s+\*\*([^*\n]+)\*\*/g)];
  for (let headingIndex = 0; headingIndex < headings.length; headingIndex++) {
    const heading = headings[headingIndex]!;
    const team = teamCode(clean(heading[1]!));
    if (!team) continue;
    const start = heading.index! + heading[0].length;
    const end = headings[headingIndex + 1]?.index ?? article.body.length;
    const section = article.body.slice(start, end);
    const candidates = identities.filter(identity => teamCode(identity.team) === team);
    const occurrences: Array<{ identity: InjuryIdentity; start: number; end: number }> = [];

    for (const identity of candidates) {
      const namePattern = identity.name
        .split("")
        .map(character => {
          if (/\s/.test(character)) return "\\s+";
          if (character === "'" || character === "’" || character === "‘") return "['’‘]";
          return character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("");
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${namePattern}(?![\\p{L}\\p{N}])`, "giu");
      for (const match of section.matchAll(pattern)) {
        if (normalizePlayerName(match[0]) !== normalizePlayerName(identity.name)) continue;
        occurrences.push({
          identity,
          start: match.index!,
          end: match.index! + match[0].length,
        });
      }
    }

    occurrences.sort((left, right) => left.start - right.start);
    for (let occurrenceIndex = 0; occurrenceIndex < occurrences.length; occurrenceIndex++) {
      const occurrence = occurrences[occurrenceIndex]!;
      const identityMatches = candidates.filter(candidate =>
        normalizePlayerName(candidate.name) === normalizePlayerName(occurrence.identity.name),
      );
      if (identityMatches.length !== 1) continue;

      const tail = section.slice(occurrence.end);
      const sentenceEnd = tail.search(/[.!?\n]/);
      let contextEnd = sentenceEnd < 0 ? section.length : occurrence.end + sentenceEnd;
      const nextMention = occurrences[occurrenceIndex + 1];
      if (nextMention && nextMention.start < contextEnd) contextEnd = nextMention.start;
      const context = clean(section.slice(occurrence.start, contextEnd));
      const id = occurrence.identity.nhlPlayerId;

      const possibleReturn = /\b(could|may|might|is expected to) return\b/i.test(context);
      const playedCurrentGame =
        /\b(?:played|skated)\b(?=[^.]{0,100}\b(?:season opener|preseason debut|regular season debut|game|opener|last night|yesterday|on thursday|on friday|on saturday|on sunday)\b)/i.test(context) ||
        /\bmade (?:his|her|their) (?:season|preseason) debut\b/i.test(context) ||
        /\b(?:expected to play|will play|returned to (?:the )?lineup|activated from (?:injured reserve|ir))\b/i.test(context);
      const explicitCurrentInjury =
        /\b(?:placed on (?:long-term )?injured reserve|on (?:long-term )?injured reserve|injured reserve)\b/i.test(context) ||
        /\b(?:is|are|was|has been|have been) (?:currently )?(?:week to week|day to day|day-to-day|in (?:the )?(?:injured|concussion) protocol)\b/i.test(context) ||
        /\b(?:being evaluated|evaluated) for\b/i.test(context) ||
        /\b(?:out with|sidelined with|dealing with|suffering from|will miss .*? due to)\b/i.test(context) ||
        /\bwith (?:a |an )?(?:lower[- ]body|upper[- ]body|concussion|shoulder|knee|hip|ankle|back) injury\b/i.test(context) ||
        /\b(?:lower[- ]body|upper[- ]body|concussion|shoulder|knee|hip|ankle|back) injury\b(?=.{0,80}\b(?:week to week|day to day|being evaluated|placed|reserve|protocol|out|miss)\b)/i.test(context);

      if (possibleReturn) {
        injuries.set(id, {
          details: context,
          sourceUrl: article.url,
          reportedAt: article.publishedAt,
        });
      } else if (playedCurrentGame) {
        availableIds.add(id);
        availableAt.set(id, article.publishedAt);
      } else if (explicitCurrentInjury) {
        injuries.set(id, {
          details: context,
          sourceUrl: article.url,
          reportedAt: article.publishedAt,
        });
      }
    }
  }
  return { injuries, availableIds, availableAt, reports: 1 };
}

export function parseNhlInjuryArticles(
  articles: readonly OfficialArticle[],
  identities: readonly InjuryIdentity[],
): ParsedInjuryEvidence {
  const result: ParsedInjuryEvidence = { injuries: new Map(), availableIds: new Set(), availableAt: new Map(), reports: 0 };
  for (const article of articles) {
    const parsed = article.url.includes("lineup-projections")
      ? projectionEvidence(article, identities)
      : statusReportEvidence(article, identities);
    result.reports += parsed.reports;
    for (const [id, evidence] of parsed.injuries) {
      const prior = result.injuries.get(id);
      if (!prior || Date.parse(evidence.reportedAt) >= Date.parse(prior.reportedAt)) {
        result.injuries.set(id, evidence);
      }
    }
    for (const id of parsed.availableIds) result.availableIds.add(id);
    for (const [id, date] of parsed.availableAt) {
      if (!result.availableAt.has(id) || Date.parse(date) > Date.parse(result.availableAt.get(id)!)) result.availableAt.set(id, date);
    }
  }
  return result;
}

export function parseNhlArticleHtml(html: string, url: string, now: Date): OfficialArticle | null {
  return parseOfficialNhlArticle(html, url, now);
}

const NHL_TEAM_CODES = new Set(Object.values(TEAM_NAMES));

function allTeamCodes(value: unknown, output = new Set<string>(), depth = 0): Set<string> {
  if (depth > 16 || value == null) return output;
  if (typeof value === "string") {
    const code = teamCode(value);
    if (code) output.add(code);
  } else if (Array.isArray(value)) {
    for (const entry of value) allTeamCodes(entry, output, depth + 1);
  } else if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const keyCode = teamCode(key);
      if (keyCode) output.add(keyCode);
      allTeamCodes(entry, output, depth + 1);
    }
  }
  return output;
}

function directField(
  object: Record<string, unknown>,
  acceptedKeys: ReadonlySet<string>,
  depth = 0,
): string | null {
  if (depth > 3) return null;
  for (const [key, value] of Object.entries(object)) {
    const normalizedKey = key.replace(/[^a-z]/gi, "").toLowerCase();
    if (acceptedKeys.has(normalizedKey)) {
      if (typeof value === "string" && value.trim()) return clean(value);
      if (typeof value === "number") return String(value);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const nested = directField(value as Record<string, unknown>, new Set([
          "displayname", "fullname", "name", "abbreviation", "shortdisplayname",
        ]), depth + 1);
        if (nested) return nested;
      }
    }
  }
  for (const value of Object.values(object)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = directField(value as Record<string, unknown>, acceptedKeys, depth + 1);
      if (nested) return nested;
    }
  }
  return null;
}

function parseBalancedJson(source: string, start: number): unknown | null {
  let opening = start;
  while (opening < source.length && /\s/.test(source[opening]!)) opening++;
  if (source[opening] !== "{" && source[opening] !== "[") return null;
  const stack: string[] = [];
  let quoted = false;
  let escaped = false;
  for (let index = opening; index < source.length; index++) {
    const character = source[index]!;
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{" || character === "[") stack.push(character);
    else if (character === "}" || character === "]") {
      const expected = character === "}" ? "{" : "[";
      if (stack.pop() !== expected) return null;
      if (!stack.length) {
        try {
          return JSON.parse(source.slice(opening, index + 1)) as unknown;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function espnJsonPayloads(html: string): unknown[] {
  const payloads: unknown[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = match[1] ?? "";
    const body = match[2] ?? "";
    if (/\bid\s*=\s*["'](?:__NEXT_DATA__|__espnfitt__)["']/i.test(attributes) ||
        /\btype\s*=\s*["']application\/(?:json|ld\+json)["']/i.test(attributes)) {
      try {
        payloads.push(JSON.parse(body.trim()) as unknown);
      } catch {
        // ESPN sometimes embeds executable assignments rather than raw JSON.
      }
    }
  }
  for (const match of html.matchAll(/__espnfitt__\s*=\s*/g)) {
    const payload = parseBalancedJson(html, match.index! + match[0].length);
    if (payload) payloads.push(payload);
  }
  return payloads;
}

interface ExtractedEspnData {
  rows: EspnInjuryRow[];
  teams: Set<string>;
  hasInjuryCollection: boolean;
  malformedRows: boolean;
}

const TEAM_KEYS = new Set(["team", "teamname", "teamdisplayname", "club", "clubname", "teamabbreviation", "teamabbr"]);
const STATUS_KEYS = new Set(["status", "injurystatus", "designation", "availability", "statusname"]);
const INJURY_KEYS = new Set(["injury", "injuries", "injurytype", "injurydescription", "description", "details", "reason", "comment", "notes"]);

function classifyEspnInjury(statusValue: string | null, injuryValue: string | null): EspnInjuryRow["status"] {
  const status = statusValue ?? "";
  const injury = injuryValue ?? "";
  const suspension = /\b(suspension|suspended|suspend)\b/i.test(`${status} ${injury}`);
  const physical = /\b(injur\w*|upper[- ]body|lower[- ]body|concussion|fractur\w*|illness|surgery|shoulder|knee|hip|ankle|back|groin|hand|wrist|head|undisclosed)\b/i.test(injury);
  const unspecifiedOut = /\b(out|day[- ]to[- ]day|DTD|injured reserve|long[- ]term injured reserve|IR(?:[- /]LT)?|LTIR)\b/i.test(status);
  if (suspension && !physical) return "not_reported_injured";
  return physical || unspecifiedOut ? "injured" : "not_reported_injured";
}

function espnPlayerName(object: Record<string, unknown>): string | null {
  const fullName = directField(object, new Set([
    "fullname", "displayname", "playername", "athletename", "playerdisplayname",
  ]));
  if (fullName) return fullName;
  const firstName = directField(object, new Set(["firstname"]));
  const lastName = directField(object, new Set(["lastname"]));
  if (firstName && lastName) return `${firstName} ${lastName}`;
  return directField(object, new Set(["name"]));
}

function extractEspnObjects(payload: unknown): ExtractedEspnData {
  const rows: EspnInjuryRow[] = [];
  const teams = allTeamCodes(payload);
  let hasInjuryCollection = false;
  let malformedRows = false;
  const visit = (value: unknown, inheritedTeam: string | null, depth: number): void => {
    if (depth > 24 || value == null) return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, inheritedTeam, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    const teamValue = directField(object, TEAM_KEYS);
    const entityLabel = directField(object, new Set(["displayname", "fullname", "name"]));
    const ownTeam = teamCode(teamValue) ?? teamCode(entityLabel) ?? inheritedTeam;
    const normalizedKeys = Object.keys(object).map(key => key.replace(/[^a-z]/gi, "").toLowerCase());
    if (normalizedKeys.some(key => key.includes("injur"))) hasInjuryCollection = true;
    const name = espnPlayerName(object);
    const status = directField(object, STATUS_KEYS);
    const injury = directField(object, INJURY_KEYS);
    const hasDirectRowFields = normalizedKeys.some(key =>
      ["status", "injurystatus", "injury", "injurydescription", "injurytype", "designation"].includes(key),
    );
    if (hasDirectRowFields && !normalizedKeys.some(key =>
      ["injuries", "injurylist", "injurydata", "injuryrecords"].includes(key),
    ) && (!name || !ownTeam)) malformedRows = true;
    if (name && ownTeam && teamCode(name) !== ownTeam && (status !== null || injury !== null)) {
      rows.push({
        name,
        team: ownTeam,
        status: classifyEspnInjury(status, injury),
        details: [status, injury].filter(Boolean).join(" — ") || "ESPN injury listing",
      });
    }
    for (const [key, child] of Object.entries(object)) {
      const keyTeam = teamCode(key);
      if (keyTeam) teams.add(keyTeam);
      visit(child, keyTeam ?? ownTeam, depth + 1);
    }
  };
  visit(payload, null, 0);
  return { rows, teams, hasInjuryCollection, malformedRows };
}

function textFromHtml(value: string): string {
  return clean(value.replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " "));
}

function contextTeamBefore(html: string, position: number): string | null {
  const prefix = html.slice(Math.max(0, position - 5_000), position);
  let latest: { code: string; index: number } | null = null;
  for (const [label, code] of Object.entries(TEAM_NAMES)) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?:^|[^\\p{L}])${escaped}(?:$|[^\\p{L}])`, "giu");
    for (const match of prefix.matchAll(pattern)) {
      const index = match.index! + match[0].length;
      if (!latest || index > latest.index) latest = { code, index };
    }
  }
  return latest?.code ?? null;
}

function parseEspnTables(html: string): ExtractedEspnData {
  const rows: EspnInjuryRow[] = [];
  const teams = new Set<string>();
  let hasInjuryCollection = false;
  for (const tableMatch of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const table = tableMatch[1] ?? "";
    const headers = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(match =>
      textFromHtml(match[1] ?? "").toLowerCase().replace(/[^a-z ]/g, "").trim(),
    );
    const nameIndex = headers.findIndex(header => /\b(name|player|athlete)\b/.test(header));
    const injuryIndex = headers.findIndex(header => /\binjur(?:y|ies)|reason|details\b/.test(header));
    const statusIndex = headers.findIndex(header => /\bstatus\b/.test(header));
    const teamIndex = headers.findIndex(header => /\bteam|club\b/.test(header));
    if (nameIndex < 0 || injuryIndex < 0 || statusIndex < 0) continue;
    hasInjuryCollection = true;
    let sectionTeam = contextTeamBefore(html, tableMatch.index!);
    const bodyRows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const rowMatch of bodyRows) {
      const cells = [...(rowMatch[1] ?? "").matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
        .map(match => textFromHtml(match[1] ?? ""));
      if (!cells.length) continue;
      const rowText = cells.join(" ").toLowerCase();
      if (/\bno injuries\b|\bno injury reported\b|\bno players listed\b/.test(rowText)) {
        if (sectionTeam) teams.add(sectionTeam);
        continue;
      }
      const rowName = cells[nameIndex] ?? "";
      const rowTeam = teamIndex >= 0 ? cells[teamIndex] : "";
      const team = teamCode(rowTeam) ?? sectionTeam;
      if (!rowName || !team) return { rows, teams, hasInjuryCollection: false, malformedRows: true };
      const status = cells[statusIndex] ?? "";
      const injury = cells[injuryIndex] ?? "";
      rows.push({
        name: rowName,
        team,
        status: classifyEspnInjury(status, injury),
        details: [status, injury].filter(Boolean).join(" — ") || "ESPN injury listing",
      });
      teams.add(team);
      sectionTeam = team;
    }
    if (sectionTeam) teams.add(sectionTeam);
  }
  return { rows, teams, hasInjuryCollection, malformedRows: false };
}

export function parseEspnInjuryPage(
  html: string,
): ParsedEspnInjuryFeed | null {
  if (!html.trim() || /awswafintegration|javascript is disabled/i.test(html)) return null;
  const payloads = espnJsonPayloads(html);
  const embedded = payloads.map(extractEspnObjects);
  const tableData = parseEspnTables(html);
  const teams = new Set<string>(tableData.teams);
  for (const data of embedded) for (const team of data.teams) teams.add(team);
  const allTeamsCovered = [...NHL_TEAM_CODES].every(team => teams.has(team));
  const hasValidCollection = tableData.hasInjuryCollection ||
    embedded.some(data => data.hasInjuryCollection);
  if (!allTeamsCovered || !hasValidCollection || embedded.some(data => data.malformedRows) || tableData.malformedRows) return null;

  const deduped = new Map<string, EspnInjuryRow>();
  for (const row of [...embedded.flatMap(data => data.rows), ...tableData.rows]) {
    const key = `${teamCode(row.team)}|${normalizePlayerName(row.name)}`;
    deduped.set(key, row);
  }

  // A full page with no injury entries is a valid empty report only when
  // structured data explicitly contains an injury collection and all clubs.
  if (deduped.size === 0 && !embedded.some(data => data.hasInjuryCollection)) return null;
  // Reject records whose club or full name cannot be interpreted instead of
  // treating malformed upstream rows as a complete injury feed.
  if ([...deduped.values()].some(row => !teamCode(row.team) || !row.name.trim())) return null;

  return {
    rows: [...deduped.values()],
    sourceReports: deduped.size,
    coveredTeams: teams.size,
  };
}

const ESPN_API_INJURY_STATUSES = new Set([
  "out", "daytoday", "dtd", "suspension", "suspended",
]);

function validEspnApiStatus(value: string): boolean {
  const normalized = value.toLocaleLowerCase("en").replace(/[^a-z]/g, "");
  return ESPN_API_INJURY_STATUSES.has(normalized) ||
    normalized.startsWith("injuredreserve") ||
    normalized.startsWith("longterminjuredreserve") ||
    (normalized.startsWith("ir") && normalized !== "irregular") ||
    normalized === "ltir";
}

export function parseEspnInjuryApiResponse(
  responseText: string,
  now = new Date(),
): ParsedEspnInjuryFeed | null {
  let payload: unknown;
  try {
    payload = JSON.parse(responseText) as unknown;
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const data = payload as Record<string, unknown>;
  if (data.status !== "success" || typeof data.timestamp !== "string" ||
      !Array.isArray(data.injuries)) return null;

  const timestamp = Date.parse(data.timestamp);
  const age = now.getTime() - timestamp;
  if (!Number.isFinite(timestamp) || age > 72 * 60 * 60_000 || age < -5 * 60_000) return null;

  if (!data.season || typeof data.season !== "object" || Array.isArray(data.season)) return null;
  const seasonYear = (data.season as Record<string, unknown>).year;
  if (!Number.isInteger(seasonYear) ||
      Number(seasonYear) < now.getUTCFullYear() ||
      Number(seasonYear) > now.getUTCFullYear() + 1) return null;

  // ESPN only emits team groups that currently have injuries; healthy clubs are
  // intentionally omitted. A non-empty successful timestamped response with
  // recognized club names therefore represents the endpoint's full-league feed.
  if (data.injuries.length === 0 || data.injuries.length > NHL_TEAM_CODES.size) return null;
  const rows: EspnInjuryRow[] = [];
  const coveredTeams = new Set<string>();
  for (const groupValue of data.injuries) {
    if (!groupValue || typeof groupValue !== "object" || Array.isArray(groupValue)) return null;
    const group = groupValue as Record<string, unknown>;
    if (typeof group.displayName !== "string" || !Array.isArray(group.injuries) ||
        group.injuries.length === 0) return null;
    const team = teamCode(group.displayName);
    if (!team || coveredTeams.has(team)) return null;
    coveredTeams.add(team);

    for (const injuryValue of group.injuries) {
      if (!injuryValue || typeof injuryValue !== "object" || Array.isArray(injuryValue)) return null;
      const injury = injuryValue as Record<string, unknown>;
      const athlete = injury.athlete;
      if (!athlete || typeof athlete !== "object" || Array.isArray(athlete)) return null;
      const name = (athlete as Record<string, unknown>).displayName;
      const status = injury.status;
      const details = injury.details;
      const injuryType = details && typeof details === "object" && !Array.isArray(details)
        ? (details as Record<string, unknown>).type : null;
      const rowTeam = injury.team && typeof injury.team === "object" && !Array.isArray(injury.team)
        ? (injury.team as Record<string, unknown>).displayName : null;
      if (typeof name !== "string" || !name.trim() || typeof status !== "string" ||
          !validEspnApiStatus(status) ||
          (rowTeam !== null && (typeof rowTeam !== "string" || teamCode(rowTeam) !== team)) ||
          (injuryType !== null && typeof injuryType !== "string")) return null;
      const physicalDetails = typeof injuryType === "string" ? injuryType : "";
      rows.push({
        name: clean(name),
        team,
        status: classifyEspnInjury(status, physicalDetails),
        details: [status, physicalDetails].filter(Boolean).join(" — ") || "ESPN injury listing",
        reportedAt: dateString(typeof injury.date === "string" ? injury.date : null),
      });
      if (rows.length > 500) return null;
    }
  }

  const deduped = new Map<string, EspnInjuryRow>();
  for (const row of rows) {
    const key = `${teamCode(row.team)}|${normalizePlayerName(row.name)}`;
    deduped.set(key, row);
  }
  return {
    rows: [...deduped.values()],
    sourceReports: deduped.size,
    coveredTeams: coveredTeams.size,
  };
}

export function mapEspnInjuriesToPool(
  feed: ParsedEspnInjuryFeed,
  identities: readonly InjuryIdentity[],
): Map<number, EspnInjuryRow> {
  const mapped = new Map<number, EspnInjuryRow>();
  const ambiguous = new Set<number>();
  for (const row of feed.rows) {
    const matches = identities.filter(identity =>
      normalizePlayerName(identity.name) === normalizePlayerName(row.name) &&
      teamCode(identity.team) === teamCode(row.team),
    );
    if (matches.length > 1) {
      for (const identity of matches) ambiguous.add(identity.nhlPlayerId);
      continue;
    }
    if (matches.length === 1) mapped.set(matches[0]!.nhlPlayerId, row);
    else if (matches.length === 0) {
      const sourceSurname = normalizePlayerName(row.name).split(/\s+/).at(-1);
      const possibleAliases = identities.filter(identity =>
        normalizePlayerName(identity.name).split(/\s+/).at(-1) === sourceSurname &&
        teamCode(identity.team) === teamCode(row.team),
      );
      for (const identity of possibleAliases) {
        if (mapped.has(identity.nhlPlayerId)) continue;
        ambiguous.add(identity.nhlPlayerId);
      }
    }
  }
  for (const id of ambiguous) {
    mapped.set(id, {
      name: identities.find(identity => identity.nhlPlayerId === id)?.name ?? "",
      team: identities.find(identity => identity.nhlPlayerId === id)?.team ?? "",
      status: "unknown",
      details: "ESPN listed an ambiguous matching full name for this club.",
    });
  }
  return mapped;
}

function cbsTeamCode(wrapper: string): string | null {
  const match = wrapper.match(/\/nhl\/teams\/([a-z]{2,3})\//i);
  if (!match) return null;
  return teamCode(match[1]!);
}

function cbsStatus(statusValue: string, injuryValue: string): InjuryFeedRow["status"] {
  const combined = `${statusValue} ${injuryValue}`.trim();
  if (/\b(suspension|suspended)\b/i.test(combined) &&
      !/\b(injur\w*|fractur\w*|concussion|surgery|illness|shoulder|knee|hip|ankle|back|groin|hand|wrist)\b/i.test(injuryValue)) {
    return "not_reported_injured";
  }
  if (/\b(out|injur\w*|day[- ]to[- ]day|dtd|ir|ltir|injured reserve|questionable|doubtful|expected to miss|week to week|week-to-week)\b/i.test(statusValue) ||
      /\b(injur\w*|fractur\w*|concussion|surgery|illness|shoulder|knee|hip|ankle|back|groin|hand|wrist|elbow|foot|leg|neck|undisclosed)\b/i.test(injuryValue)) {
    return "injured";
  }
  return "unknown";
}

function cbsFullPlayerName(cell: string): string | null {
  const names = [...cell.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .filter(match => /href\s*=\s*["'][^"']*\/nhl\/players\/\d+\/[^"']*["']/i.test(match[1] ?? ""))
    .map(match => {
      const body = match[2] ?? "";
      const longName = [...body.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi)]
        .find(span => /CellPlayerName--long/i.test(span[1] ?? ""));
      return clean(longName?.[2] ?? body);
    })
    .filter(name => {
      const parts = name.split(/\s+/);
      return parts.length >= 2 && !/^[A-Z]\.$/.test(parts[0]!);
    })
    .sort((left, right) => right.length - left.length);
  return names[0] ?? null;
}

/**
 * CBS's injury page consists of one table per club. A club with no injuries
 * must still have an explicit, correctly headed empty table before this feed
 * is considered complete; absent clubs are never inferred to be healthy.
 */
export function parseCbsInjuryPage(html: string): ParsedInjuryFeed | null {
  if (!html.trim() || html.length > 1_500_000 || !/<html\b/i.test(html) || !/<\/html\s*>/i.test(html) ||
      /awswafintegration|javascript is disabled|access denied|verify you are human|captcha (?:challenge|verification)|<title[^>]*>[^<]*captcha/i.test(html)) {
    return null;
  }
  const rows: InjuryFeedRow[] = [];
  const coveredTeams = new Set<string>();
  let tableCount = 0;
  const wrappers = [...html.matchAll(/<div\b[^>]*class=["'][^"']*\bTableBaseWrapper\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bTableBaseWrapper\b|$)/gi)];
  for (const wrapperMatch of wrappers) {
    const wrapper = wrapperMatch[1] ?? "";
    const tables = [...wrapper.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
    if (tables.length !== 1) return null;
    const team = cbsTeamCode(wrapper);
    if (!team || coveredTeams.has(team)) return null;
    const table = tables[0]![1] ?? "";
    const headers = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)]
      .map(match => clean(match[1] ?? "").toLocaleLowerCase("en").replace(/[^a-z ]/g, "").trim());
    const indexes = {
      player: headers.findIndex(header => header === "player"),
      position: headers.findIndex(header => header === "position"),
      updated: headers.findIndex(header => header === "updated"),
      injury: headers.findIndex(header => header === "injury"),
      status: headers.findIndex(header => header === "injury status"),
    };
    if (Object.values(indexes).some(index => index < 0)) return null;
    tableCount++;
    coveredTeams.add(team);

    for (const rowMatch of (table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? "")
      .matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...(rowMatch[1] ?? "").matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
        .map(match => match[1] ?? "");
      if (!cells.length || Math.max(...Object.values(indexes)) >= cells.length) return null;
      const name = cbsFullPlayerName(cells[indexes.player]!);
      const position = clean(cells[indexes.position]!);
      const updated = clean(cells[indexes.updated]!);
      const injury = clean(cells[indexes.injury]!);
      const statusText = clean(cells[indexes.status]!);
      if (!name || !position || !updated || !statusText) return null;
      rows.push({
        name,
        team,
        status: cbsStatus(statusText, injury),
        details: [injury, statusText].filter(Boolean).join(" — ") || "CBS Sports injury listing",
      });
      if (rows.length > 1_000) return null;
    }
  }
  // CBS only renders teams with injury reports. A substantial, structurally
  // complete set of club tables is usable positive evidence; omitted clubs
  // remain unknown in the service and are never treated as healthy.
  if (tableCount < 24 || coveredTeams.size !== tableCount) return null;

  const deduped = new Map<string, InjuryFeedRow>();
  for (const row of rows) {
    const key = `${row.team}|${normalizePlayerName(row.name)}`;
    if (deduped.has(key)) return null;
    deduped.set(key, row);
  }
  return {
    rows: [...deduped.values()],
    sourceReports: deduped.size,
    coveredTeams: coveredTeams.size,
    coveredTeamCodes: [...coveredTeams],
    complete: coveredTeams.size === NHL_TEAM_CODES.size,
  };
}

export function cbsFeedCoversTeam(feed: ParsedInjuryFeed, team: string | null | undefined): boolean {
  const code = teamCode(team);
  return Boolean(code && feed.coveredTeamCodes?.includes(code));
}

export function mapCbsInjuriesToPool(
  feed: ParsedInjuryFeed,
  identities: readonly InjuryIdentity[],
): Map<number, InjuryFeedRow> {
  const mapped = new Map<number, InjuryFeedRow>();
  const ambiguous = new Set<number>();
  for (const row of feed.rows) {
    const matches = identities.filter(identity =>
      normalizePlayerName(identity.name) === normalizePlayerName(row.name) &&
      teamCode(identity.team) === teamCode(row.team),
    );
    if (matches.length === 1) {
      mapped.set(matches[0]!.nhlPlayerId, row);
      continue;
    }
    if (matches.length > 1) {
      for (const identity of matches) ambiguous.add(identity.nhlPlayerId);
      continue;
    }
    const surname = normalizePlayerName(row.name).split(/\s+/).at(-1);
    for (const identity of identities) {
      if (normalizePlayerName(identity.name).split(/\s+/).at(-1) === surname &&
          teamCode(identity.team) === teamCode(row.team)) ambiguous.add(identity.nhlPlayerId);
    }
  }
  for (const id of ambiguous) {
    const identity = identities.find(item => item.nhlPlayerId === id)!;
    mapped.set(id, {
      name: identity.name,
      team: identity.team ?? "",
      status: "unknown",
      details: "CBS listed a similar but non-matching or ambiguous full name for this club.",
    });
  }
  return mapped;
}