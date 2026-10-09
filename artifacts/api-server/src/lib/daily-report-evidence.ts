/** Report reads share the application's connection pool with live scoring requests. */
export async function readReportSnapshots<D, S, R, A>(load: {
  daily: () => Promise<D>;
  prior: () => Promise<D>;
  season: () => Promise<S>;
  rosters: () => Promise<R>;
  archive: () => Promise<A>;
}) {
  // Each scoring read already performs database work internally. Starting all
  // five together can exhaust connections while the publication lock is held.
  const daily = await load.daily();
  const prior = await load.prior();
  const season = await load.season();
  const rosters = await load.rosters();
  const archiveRecord = await load.archive();
  return { daily, prior, season, rosters, archiveRecord };
}
