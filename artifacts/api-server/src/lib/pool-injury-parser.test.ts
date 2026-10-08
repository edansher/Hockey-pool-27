import assert from "node:assert/strict";
import test from "node:test";
import {
  parseNhlArticleHtml,
  parseNhlInjuryArticles,
  mapEspnInjuriesToPool,
  parseEspnInjuryApiResponse,
  parseEspnInjuryPage,
  parseCbsInjuryPage,
  mapCbsInjuriesToPool,
  type InjuryIdentity,
} from "./pool-injury-parser";

test("pool full club names match NHL projected-lineup club nicknames", () => {
  const html = `<script type="application/ld&#x2B;json">${JSON.stringify({
    "@type": "NewsArticle", datePublished: "2026-10-01T12:00:00Z",
    articleBody: "**Wild projected lineup**\n***Injured:** Filip Gustavsson (lower body)*",
  })}</script>`;
  const article = parseNhlArticleHtml(html, "https://www.nhl.com/news/nhl-lineup-projections-2026-27-season", new Date("2026-10-01T12:30:00Z"));
  assert.ok(article);
  const evidence = parseNhlInjuryArticles([article], [{ nhlPlayerId: 8476889, name: "Filip Gustavsson", team: "Minnesota Wild" }]);
  assert.equal(evidence.injuries.get(8476889)?.details, "lower body");
});

test("real NHL HTML-encoded JSON-LD MIME type and revised article timestamp are accepted", () => {
  const data = {
    "@type": "NewsArticle", articleBody: "**Wild projected lineup**\n***Injured:** Filip Gustavsson (lower body)*",
    datePublished: "2026-10-01T12:00:00Z", dateModified: "2026-10-01T12:05:00Z",
  };
  const html = `<script type="application/ld&#x2B;json">${JSON.stringify(data)}</script>`;
  const article = parseNhlArticleHtml(html, "https://www.nhl.com/news/nhl-lineup-projections-2026-27-season", new Date("2026-10-01T12:30:00Z"));
  assert.equal(article?.publishedAt, "2026-10-01T12:05:00.000Z");
  assert.ok(article?.body.includes("Filip Gustavsson"));
});

const identities: InjuryIdentity[] = [
  { nhlPlayerId: 8475168, name: "Matt Duchene", team: "DAL" },
  { nhlPlayerId: 8478445, name: "Mathew Barzal", team: "NYI" },
  { nhlPlayerId: 8475692, name: "Tyler Seguin", team: "DAL" },
  { nhlPlayerId: 8476889, name: "Filip Gustavsson", team: "MIN" },
  { nhlPlayerId: 8471214, name: "Alex Lyon", team: "BUF" },
  { nhlPlayerId: 8478500, name: "Ivan Provorov", team: "CBJ" },
  { nhlPlayerId: 8476892, name: "Mattias Samuelsson", team: "BUF" },
  { nhlPlayerId: 8481559, name: "Olen Zellweger", team: "BUF" },
  { nhlPlayerId: 8477456, name: "Blake Lizotte", team: "PIT" },
  { nhlPlayerId: 8479325, name: "Charlie McAvoy", team: "BOS" },
];

function article(url: string, body: string, publishedAt = "2026-10-01T12:00:00Z") {
  return { url, body, publishedAt };
}

test("projection evidence recognizes explicit injury lists including goalies and exact team/name", () => {
  const parsed = parseNhlInjuryArticles([
    article("https://www.nhl.com/news/nhl-lineup-projections-2026-27-season", [
      "**Stars projected lineup**",
      "Forwards: Matt Duchene, Tyler Seguin",
      "***Injured:** Matt Duchene (lower body)*",
      "**Wild projected lineup**",
      "***Injured:** Filip Gustavsson (lower body)*",
      "**Sabres projected lineup**",
      "***Injured:** Alex Lyon (upper body)*",
    ].join("\n")),
  ], identities);
  assert.equal(parsed.injuries.get(8475168)?.details, "lower body");
  assert.equal(parsed.injuries.get(8476889)?.details, "lower body");
  assert.equal(parsed.injuries.get(8471214)?.details, "upper body");
  assert.equal(parsed.injuries.has(8475692), false);
  assert.equal(parsed.availableIds.has(8475692), true);
});

test("status reports use NHL player IDs and do not mistake possible returns or history for new injuries", () => {
  const parsed = parseNhlInjuryArticles([
    article("https://www.nhl.com/news/nhl-status-report-news-and-notes-october-1-2026", [
      "[Matt Duchene](https://www.nhl.com/player/matt-duchene-8475168) (lower body) was placed on long-term injured reserve.",
      "[Mathew Barzal](https://www.nhl.com/player/mathew-barzal-8478445) could return to the ice this weekend.",
      "[Tyler Seguin](https://www.nhl.com/player/tyler-seguin-8475692) made his preseason debut after a torn ACL last December.",
    ].join("\n")),
  ], identities);
  assert.equal(parsed.injuries.has(8475168), true);
  assert.equal(parsed.injuries.has(8478445), true);
  assert.equal(parsed.availableIds.has(8478445), false);
  assert.equal(parsed.injuries.has(8475692), false);
  assert.equal(parsed.availableIds.has(8475692), true);
});

test("plain-Markdown NHL status report sections resolve exact full names and current clauses", () => {
  const parsed = parseNhlInjuryArticles([
    article("https://www.nhl.com/news/nhl-status-report-news-and-notes-october-1-2026", [
      "## **Columbus Blue Jackets**",
      "Ivan Provorov is week to week for Blue Jackets with lower-body injury and was placed on injured reserve Thursday.",
      "## **Dallas Stars**",
      "Matt Duchene (lower body) was placed on long-term injured reserve by Stars Thursday.",
      "Tyler Seguin made his preseason debut after a torn ACL last December.",
      "## **New York Islanders**",
      "Mathew Barzal could return to the ice this weekend.",
      "## **Buffalo Sabres**",
      "Mattias Samuelsson (lower body) played in Sabres season opener Thursday. He had an injury last season.",
      "Olen Zellweger did not play Thursday; defenseman has been in concussion protocol since Sept. 22.",
      "## **Pittsburgh Penguins**",
      "Blake Lizotte is being evaluated for lower-body injury.",
    ].join("\n")),
  ], identities);

  for (const id of [8478500, 8475168, 8478445, 8481559, 8477456]) {
    assert.equal(parsed.injuries.has(id), true, `expected current injury evidence for ${id}`);
  }
  assert.equal(parsed.injuries.has(8476892), false, "a played-in-opener statement clears older injury wording");
  assert.equal(parsed.availableIds.has(8476892), true);
  assert.equal(parsed.injuries.has(8475692), false, "preseason debut is not historical injury evidence");
  assert.equal(parsed.availableIds.has(8475692), true);
});

test("plain-Markdown matching never guesses surnames, wrong clubs, or duplicate full-name identities", () => {
  const wrongClub = parseNhlInjuryArticles([
    article("https://www.nhl.com/news/nhl-status-report-news-and-notes-october-1-2026",
      "## **Dallas Stars**\nDuchene was placed on long-term injured reserve."),
  ], identities);
  assert.equal(wrongClub.injuries.has(8475168), false);

  const duplicateIdentity = parseNhlInjuryArticles([
    article("https://www.nhl.com/news/nhl-status-report-news-and-notes-october-1-2026",
      "## **Dallas Stars**\nMatt Duchene (lower body) was placed on long-term injured reserve."),
  ], [
    ...identities,
    { nhlPlayerId: 8479999, name: "Matt Duchene", team: "DAL" },
    { nhlPlayerId: 8480000, name: "Matt Duchene", team: "OTT" },
  ]);
  assert.equal(duplicateIdentity.injuries.has(8475168), false);
  assert.equal(duplicateIdentity.injuries.has(8479999), false);
});

test("JSON-LD articles require valid publication dates and article bodies", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@type": "NewsArticle", datePublished: "2026-10-01T12:00:00Z", articleBody: "**Injured**",
  })}</script>`;
  assert.equal(parseNhlArticleHtml(html, "https://www.nhl.com/news/test", new Date("2026-10-01T12:30:00Z"))?.body, "**Injured**");
  assert.equal(parseNhlArticleHtml(html, "https://www.nhl.com/news/test", new Date("2026-09-01T00:00:00Z")), null);
  assert.equal(parseNhlArticleHtml("<html>not an article</html>", "https://www.nhl.com/news/test", new Date()), null);
});

const espnLeagueTeams = [
  "Anaheim Ducks", "Boston Bruins", "Buffalo Sabres", "Calgary Flames", "Carolina Hurricanes",
  "Chicago Blackhawks", "Colorado Avalanche", "Columbus Blue Jackets", "Dallas Stars",
  "Detroit Red Wings", "Edmonton Oilers", "Florida Panthers", "Los Angeles Kings",
  "Minnesota Wild", "Montreal Canadiens", "Nashville Predators", "New Jersey Devils",
  "New York Islanders", "New York Rangers", "Ottawa Senators", "Philadelphia Flyers",
  "Pittsburgh Penguins", "San Jose Sharks", "Seattle Kraken", "St. Louis Blues",
  "Tampa Bay Lightning", "Toronto Maple Leafs", "Utah Mammoth", "Vancouver Canucks",
  "Vegas Golden Knights", "Washington Capitals", "Winnipeg Jets",
];

function espnPage(
  entries: Array<{ team: string; name: string; status: string; injury?: string }>,
): string {
  const teams = espnLeagueTeams.map(displayName => ({
    displayName,
    injuries: entries.filter(entry => entry.team === displayName).map(entry => ({
      athlete: { displayName: entry.name },
      status: { name: entry.status },
      injury: entry.injury ?? "",
    })),
  }));
  return `<script id="__espnfitt__" type="application/json">${JSON.stringify({
    page: { name: "nhl_injuries" },
    injuries: { teams },
  })}</script>`;
}

test("ESPN full-league embedded payload maps full player names and canonical clubs only", () => {
  const parsed = parseEspnInjuryPage(espnPage([
    { team: "Dallas Stars", name: "Matt Duchene", status: "Injured Reserve", injury: "Lower Body" },
    { team: "New York Islanders", name: "Mathew Barzal", status: "Day-To-Day", injury: "Upper Body" },
    { team: "Buffalo Sabres", name: "Mattias Samuelsson", status: "Out", injury: "Lower Body" },
    { team: "Pittsburgh Penguins", name: "Someone Else", status: "Out", injury: "Suspension" },
  ]));
  assert.ok(parsed);
  assert.equal(parsed.coveredTeams, 32);
  assert.equal(parsed.rows.length, 4);

  const mapped = mapEspnInjuriesToPool(parsed, identities);
  assert.equal(mapped.get(8475168)?.status, "injured");
  assert.equal(mapped.get(8478445)?.status, "injured");
  assert.equal(mapped.get(8476892)?.status, "injured");
  assert.equal(mapped.has(8475692), false);
});

test("official ESPN JSON API accepts omitted healthy clubs and validates current rows", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const groups = espnLeagueTeams.slice(0, 30).map(team => ({
    displayName: team,
    injuries: [{
      id: "594274",
      athlete: {
        id: "3648015",
        displayName: team === "Dallas Stars" ? "Matt Duchene"
          : team === "Boston Bruins" ? "Charlie McAvoy" : "Unowned Player",
      },
      team: { displayName: team },
      status: team === "Boston Bruins" ? "Suspension" : "Injured Reserve",
      details: { type: team === "Boston Bruins" ? "Suspension" : "Lower Body", returnDate: "2026-10-02" },
    }],
  }));
  const payload = JSON.stringify({
    status: "success",
    timestamp: "2026-10-01T11:59:00Z",
    season: { displayName: "2026-27", year: 2027 },
    injuries: groups,
  });
  const parsed = parseEspnInjuryApiResponse(payload, now);
  assert.ok(parsed);
  assert.equal(parsed.coveredTeams, 30, "healthy clubs omitted from the API are not required");
  assert.equal(parsed.sourceReports, 30);
  const mapped = mapEspnInjuriesToPool(parsed, identities);
  assert.equal(mapped.get(8475168)?.status, "injured");
  assert.equal(mapped.get(8479325)?.status, "not_reported_injured");
  assert.equal(mapped.has(594274), false, "injury-record IDs are never treated as NHL IDs");
  assert.equal(mapped.has(3648015), false, "ESPN athlete IDs are never treated as NHL IDs");

  const base = JSON.parse(payload) as Record<string, unknown>;
  assert.equal(parseEspnInjuryApiResponse(JSON.stringify({ ...base, status: "error" }), now), null);
  assert.equal(parseEspnInjuryApiResponse(JSON.stringify({ ...base, timestamp: "2026-09-20T00:00:00Z" }), now), null);
  assert.equal(parseEspnInjuryApiResponse(JSON.stringify({ ...base, injuries: [] }), now), null);
  const invalidStatus = structuredClone(base) as Record<string, unknown>;
  (invalidStatus.injuries as Array<{ injuries: Array<{ status: string }> }>)[0]!.injuries[0]!.status = "Questionable";
  assert.equal(parseEspnInjuryApiResponse(JSON.stringify(invalidStatus), now), null);
  const unknownClub = structuredClone(base) as Record<string, unknown>;
  (unknownClub.injuries as Array<{ displayName: string }>)[0]!.displayName = "Portland Pioneers";
  assert.equal(parseEspnInjuryApiResponse(JSON.stringify(unknownClub), now), null);
});

test("ESPN complete per-team injury tables parse without treating ESPN IDs as NHL IDs", () => {
  const html = espnLeagueTeams.map(team => {
    const row = team === "Dallas Stars"
      ? "<tr><td><a href='/nhl/player/_/id/999/matt-duchene'>Matt Duchene</a></td><td>Lower Body</td><td>Injured Reserve</td></tr>"
      : "";
    return `<h2>${team}</h2><table><thead><tr><th>Name</th><th>Injury</th><th>Status</th></tr></thead><tbody>${row}</tbody></table>`;
  }).join("");
  const parsed = parseEspnInjuryPage(html);
  assert.ok(parsed);
  assert.equal(parsed.coveredTeams, 32);
  assert.equal(parsed.sourceReports, 1);
  const mapped = mapEspnInjuriesToPool(parsed, identities);
  assert.equal(mapped.get(8475168)?.status, "injured");
  assert.equal(mapped.has(999), false, "ESPN page identifiers are never treated as NHL player IDs");
});

test("ESPN suspension alone is not an injury; unknown status Out and DTD count as injuries", () => {
  const page = parseEspnInjuryPage(espnPage([
    { team: "Dallas Stars", name: "Matt Duchene", status: "Out", injury: "Suspension" },
    { team: "New York Islanders", name: "Mathew Barzal", status: "Day-To-Day" },
    { team: "Buffalo Sabres", name: "Alex Lyon", status: "IR" },
  ]));
  assert.ok(page);
  assert.equal(page.rows.find(row => row.name === "Matt Duchene")?.status, "not_reported_injured");
  assert.equal(page.rows.find(row => row.name === "Mathew Barzal")?.status, "injured");
  assert.equal(page.rows.find(row => row.name === "Alex Lyon")?.status, "injured");
});

test("ESPN malformed, challenged, incomplete, or ambiguous feeds do not become healthy snapshots", () => {
  assert.equal(parseEspnInjuryPage(""), null);
  assert.equal(parseEspnInjuryPage("<html>JavaScript is disabled; AwsWafIntegration</html>"), null);
  assert.ok(parseEspnInjuryPage(espnPage([])), "complete full-league empty injury collection is valid");
  assert.equal(parseEspnInjuryPage(espnPage([]).replace("Winnipeg Jets", "Unknown Club")), null);

  const duplicateNames = [
    ...identities,
    { nhlPlayerId: 8479999, name: "Matt Duchene", team: "DAL" },
  ];
  const parsed = parseEspnInjuryPage(espnPage([
    { team: "Dallas Stars", name: "Matt Duchene", status: "IR", injury: "Lower Body" },
  ]));
  assert.ok(parsed);
  const mapped = mapEspnInjuriesToPool(parsed, duplicateNames);
  assert.equal(mapped.get(8475168)?.status, "unknown");
  assert.equal(mapped.get(8479999)?.status, "unknown");
});

test("unverified Alex/Alexander full-name alias stays unknown instead of using an ESPN or NHL ID guess", () => {
  const parsed = parseEspnInjuryPage(espnPage([
    { team: "Buffalo Sabres", name: "Alex Lyon", status: "Out", injury: "Upper Body" },
  ]));
  assert.ok(parsed);
  const mapped = mapEspnInjuriesToPool(parsed, [
    { nhlPlayerId: 8471214, name: "Alexander Lyon", team: "Buffalo Sabres" },
  ]);
  assert.equal(mapped.get(8471214)?.status, "unknown");
  assert.match(mapped.get(8471214)?.details ?? "", /ambiguous matching full name/);
});

const cbsTeams = [
  ["Anaheim Ducks", "ANA"], ["Boston Bruins", "BOS"], ["Buffalo Sabres", "BUF"],
  ["Calgary Flames", "CGY"], ["Carolina Hurricanes", "CAR"], ["Chicago Blackhawks", "CHI"],
  ["Colorado Avalanche", "COL"], ["Columbus Blue Jackets", "CLB"], ["Dallas Stars", "DAL"],
  ["Detroit Red Wings", "DET"], ["Edmonton Oilers", "EDM"], ["Florida Panthers", "FLA"],
  ["Los Angeles Kings", "LA"], ["Minnesota Wild", "MIN"], ["Montreal Canadiens", "MON"],
  ["Nashville Predators", "NSH"], ["New Jersey Devils", "NJ"], ["New York Islanders", "NYI"],
  ["New York Rangers", "NYR"], ["Ottawa Senators", "OTT"], ["Philadelphia Flyers", "PHI"],
  ["Pittsburgh Penguins", "PIT"], ["San Jose Sharks", "SJ"], ["Seattle Kraken", "SEA"],
  ["St. Louis Blues", "STL"], ["Tampa Bay Lightning", "TB"], ["Toronto Maple Leafs", "TOR"],
  ["Utah Mammoth", "UTA"], ["Vancouver Canucks", "VAN"], ["Vegas Golden Knights", "LV"],
  ["Washington Capitals", "WAS"], ["Winnipeg Jets", "WPG"],
] as const;

function cbsHtml(
  entries: Array<{ team: string; name: string; position?: string; injury?: string; status: string }> = [],
  omittedTeams: readonly string[] = [],
) {
  const tables = cbsTeams.filter(([team]) => !omittedTeams.includes(team)).map(([team, code]) => {
    const rows = entries.filter(entry => entry.team === team).map((entry, index) =>
      `<tr class="TableBase-bodyTr"><td><span class="CellPlayerName--short"><a href="/nhl/players/${900000 + index}/player/">${entry.name.split(" ").map(word => word[0]).join(". ")}.</a></span><span class="CellPlayerName--long"><a href="/nhl/players/${900000 + index}/player/">${entry.name}</a></span></td><td>${entry.position ?? "F"}</td><td>Tue, Sep 29</td><td>${entry.injury ?? "Lower Body"}</td><td>${entry.status}</td></tr>`,
    ).join("");
    return `<div class="TableBaseWrapper"><h4><a href="/nhl/teams/${code}/team/">${team}</a></h4><table class="TableBase-table"><thead><tr><th>Player</th><th>Position</th><th>Updated</th><th>Injury</th><th>Injury Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join("");
  return `<html><body>${tables}</body></html>`;
}

test("CBS complete current club tables map exact full names for skaters and goalies, never CBS player IDs", () => {
  const parsed = parseCbsInjuryPage(cbsHtml([
    { team: "Dallas Stars", name: "Matt Duchene", status: "IR. Expected to be out until at least Oct 31", injury: "Lower Body" },
    { team: "Minnesota Wild", name: "Filip Gustavsson", position: "G", status: "Day-to-Day", injury: "Lower Body" },
    { team: "Toronto Maple Leafs", name: "Unowned Player", status: "Out", injury: "Knee" },
  ]));
  assert.ok(parsed);
  assert.equal(parsed.coveredTeams, 32);
  assert.equal(parsed.sourceReports, 3);
  const mapped = mapCbsInjuriesToPool(parsed, identities);
  assert.equal(mapped.get(8475168)?.status, "injured");
  assert.equal(mapped.get(8476889)?.status, "injured");
  assert.equal(mapped.has(900000), false, "CBS player IDs are never used as NHL IDs");
  assert.equal(mapped.has(8475692), false);
});

test("CBS complete healthy tables are accepted and malformed or under-covered pages fail closed", () => {
  const completeEmpty = cbsHtml();
  assert.equal(parseCbsInjuryPage(completeEmpty)?.complete, true);
  assert.equal(parseCbsInjuryPage(completeEmpty.replace(/<div class="TableBaseWrapper">[\s\S]*?<\/div>/, ""))?.coveredTeams, 31);
  assert.equal(parseCbsInjuryPage(completeEmpty.replace("<th>Injury Status</th>", "<th>Status</th>")), null);
  assert.equal(parseCbsInjuryPage(""), null);
  assert.equal(parseCbsInjuryPage("<html>Access denied - verify you are human</html>"), null);
  assert.equal(parseCbsInjuryPage("<html>JavaScript is disabled; AwsWafIntegration</html>"), null);
  assert.equal(parseCbsInjuryPage(cbsHtml([], cbsTeams.slice(0, 9).map(([team]) => team))), null);
});

test("CBS partial current page keeps all positive injury rows while marking omitted clubs uncovered", () => {
  const parsed = parseCbsInjuryPage(cbsHtml([
    { team: "Dallas Stars", name: "Matt Duchene", status: "IR", injury: "Lower Body" },
    { team: "Minnesota Wild", name: "Filip Gustavsson", position: "G", status: "Day-to-Day", injury: "Lower Body" },
  ], ["Nashville Predators"]));
  assert.ok(parsed);
  assert.equal(parsed.coveredTeams, 31);
  assert.equal(parsed.complete, false);
  assert.equal(parsed.rows.length, 2);
  const mapped = mapCbsInjuriesToPool(parsed, identities);
  assert.equal(mapped.get(8475168)?.status, "injured");
  assert.equal(mapped.get(8476889)?.status, "injured");
});

test("CBS uses only full names and preserves ambiguous, unknown and unverified statuses", () => {
  const html = cbsHtml([
    { team: "Buffalo Sabres", name: "Alex Lyon", status: "Out", injury: "Upper Body" },
    { team: "Dallas Stars", name: "Matt Duchene", status: "Pending Evaluation", injury: "Mystery" },
  ]);
  const parsed = parseCbsInjuryPage(html);
  assert.ok(parsed);
  const mapped = mapCbsInjuriesToPool(parsed, [
    { nhlPlayerId: 8471214, name: "Alexander Lyon", team: "Buffalo Sabres" },
    { nhlPlayerId: 8475168, name: "Matt Duchene", team: "DAL" },
  ]);
  assert.equal(mapped.get(8471214)?.status, "unknown");
  assert.match(mapped.get(8471214)?.details ?? "", /similar|ambiguous/i);
  assert.equal(mapped.get(8475168)?.status, "unknown");
});

test("CBS prefers its long player-name anchor while preserving legitimate compound initials", () => {
  const parsed = parseCbsInjuryPage(cbsHtml([
    { team: "Anaheim Ducks", name: "A.J. Greer", status: "Out", injury: "Upper Body" },
  ]));
  assert.ok(parsed);
  const mapped = mapCbsInjuriesToPool(parsed, [
    { nhlPlayerId: 8490001, name: "A.J. Greer", team: "ANA" },
  ]);
  assert.equal(mapped.get(8490001)?.name, "A.J. Greer");
  assert.equal(mapped.get(8490001)?.status, "injured");
});