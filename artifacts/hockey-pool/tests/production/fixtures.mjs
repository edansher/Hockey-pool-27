// Synthetic, signed-out data. Never fetched from either pool database.
const owner = {
  id: 'smoke-owner', name: 'Smoke Test Team', rank: 1, previousRank: 1,
  rankMovement: 0, seasonPoints: 42, yesterdayPoints: 3, livePoints: 2,
  playing: 4, gamesPlayed: 10, pointsPerGame: 4.2,
  transactionsUsed: 0, rosterComplete: true,
};

export const fixtures = {
  '/api/healthz': { status: 'ok' },
  '/api/standings': {
    status: 'available', reason: 'Synthetic smoke-check standings',
    asOf: '2026-10-03T12:00:00Z', date: '2026-10-03', rows: [owner],
  },
  '/api/owners': [owner],
  '/api/draft-rosters': [],
  '/api/pool-scoring': {
    status: 'available', season: 20262027, rows: [],
    reason: 'Synthetic smoke-check scoring', asOf: '2026-10-03T12:00:00Z',
  },
  '/api/transactions': [],
  '/api/transaction-summary': {
    baseEarnings: 900, totalPoolEarnings: 900, totalCompletedTransactions: 0,
    transactionCost: 10, maxDrops: 9, payouts: [], recordingEnabled: false,
    recordingReason: 'Read-only smoke check',
    participants: [{
      ownerId: owner.id, ownerName: owner.name, dropsUsed: 0, dropsLeft: 9,
      transactionSpend: 0, amountOwing: 0,
    }],
  },
  '/api/participant/access': {
    authenticated: false, authorized: false, ownerId: null, isAdmin: false,
  },
  '/api/admin/access': { authenticated: false, authorized: false, email: null },
  '/api/transaction-access': {
    authenticated: false, admin: false, ownerId: null,
    reason: 'Signed-out smoke check', owners: [],
  },
  '/api/nhl-source': {
    provider: 'NHL', sourceUrl: 'https://www.nhl.com', season: 20262027,
    refreshIntervalSeconds: 300, status: 'available', isRefreshing: false,
    lastAttemptAt: null, lastSuccessAt: '2026-10-03T12:00:00Z',
    nextRefreshAt: null, error: null, today: { date: '2026-10-03', games: [] },
    lastNight: { date: '2026-10-02', games: [] },
  },
};