/**
 * Official 2026–27 NHL roster snapshot retrieved on 2026-10-01.
 * Ownership is pinned to the original draft slot, not silently reassigned when
 * an NHL roster changes. NHL roster ordering does not establish depth-chart roles.
 */
export const draftedGoalieRosterSnapshot: Record<string, {
  club: string;
  team: string;
  goalies: ReadonlyArray<readonly [number, string]>;
}> = {
  "cohen:12": { club: "EDM", team: "Edmonton Oilers", goalies: [
    [8475883, "Frederik Andersen"], [8477465, "Tristan Jarry"], [8482221, "Devon Levi"],
  ] },
  "cohen:19": { club: "UTA", team: "Utah Mammoth", goalies: [
    [8482657, "Sebastian Cossa"], [8478872, "Karel Vejmelka"],
  ] },
  "drb-and-son:6": { club: "CAR", team: "Carolina Hurricanes", goalies: [
    [8483548, "Brandon Bussi"], [8481611, "Pyotr Kochetkov"],
  ] },
  "drb-and-son:13": { club: "BOS", team: "Boston Bruins", goalies: [
    [8480022, "Michael DiPietro"], [8480280, "Jeremy Swayman"],
  ] },
  "edan:12": { club: "MTL", team: "Montréal Canadiens", goalies: [
    [8482487, "Jakub Dobes"], [8478470, "Samuel Montembeault"],
  ] },
  "edan:20": { club: "BUF", team: "Buffalo Sabres", goalies: [
    [8481551, "Colten Ellis"], [8480045, "Ukko-Pekka Luukkonen"], [8479312, "Alex Lyon"],
  ] },
  "jimmy:6": { club: "TBL", team: "Tampa Bay Lightning", goalies: [
    [8483710, "Dennis Hildeby"], [8476883, "Andrei Vasilevskiy"],
  ] },
  "jimmy:15": { club: "NYI", team: "New York Islanders", goalies: [
    [8478009, "Ilya Sorokin"], [8473575, "Semyon Varlamov"],
  ] },
  "joe:7": { club: "COL", team: "Colorado Avalanche", goalies: [
    [8478406, "Mackenzie Blackwood"], [8475809, "Scott Wedgewood"],
  ] },
  "joe:18": { club: "SJS", team: "San Jose Sharks", goalies: [
    [8482137, "Yaroslav Askarov"], [8477968, "Alex Nedeljkovic"],
  ] },
  "korm:13": { club: "TOR", team: "Toronto Maple Leafs", goalies: [
    [8475683, "Sergei Bobrovsky"], [8476932, "Anthony Stolarz"],
  ] },
  "korm:18": { club: "NYR", team: "New York Rangers", goalies: [
    [8482193, "Dylan Garand"], [8476914, "Joonas Korpisalo"], [8478048, "Igor Shesterkin"],
  ] },
  "nana:12": { club: "FLA", team: "Florida Panthers", goalies: [
    [8474593, "Jacob Markstrom"], [8481033, "Akira Schmid"],
  ] },
  "nana:18": { club: "VGK", team: "Vegas Golden Knights", goalies: [
    [8479394, "Carter Hart"], [8478499, "Adin Hill"],
  ] },
  "rob:8": { club: "DAL", team: "Dallas Stars", goalies: [
    [8479193, "Casey DeSmith"], [8479979, "Jake Oettinger"],
  ] },
  "rob:10": { club: "MIN", team: "Minnesota Wild", goalies: [
    [8475717, "Calvin Pickard"], [8482661, "Jesper Wallstedt"],
  ] },
  "weezbark:10": { club: "WSH", team: "Washington Capitals", goalies: [
    [8479292, "Charlie Lindgren"], [8480313, "Logan Thompson"],
  ] },
  "weezbark:18": { club: "ANA", team: "Anaheim Ducks", goalies: [
    [8476316, "Laurent Brossoit"], [8480843, "Lukas Dostal"], [8478024, "Ville Husso"],
  ] },
};