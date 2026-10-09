const BASE_POOL_EARNINGS = 2700;
const TRANSACTION_COST = 50;
export const MAX_DROPS = 9;

export function transactionAccounting(
  owners: ReadonlyArray<{ id: string; name: string }>,
  completed: ReadonlyArray<{ ownerId: string; paid?: boolean; reversedAt?: Date | string | null }>,
  settings: ReadonlyArray<{ ownerId: string; transactionLimit: number; countAdjustment: number }> = [],
) {
  completed = completed.filter(row => !row.reversedAt);
  const counts = new Map<string, number>();
  const unpaid = new Map<string, number>();
  const knownOwners = new Set(owners.map(owner => owner.id));
  for (const row of completed) {
    if (!knownOwners.has(row.ownerId)) throw new Error("Transaction owner is not in the pool");
    counts.set(row.ownerId, (counts.get(row.ownerId) ?? 0) + 1);
    if (row.paid !== true) unpaid.set(row.ownerId, (unpaid.get(row.ownerId) ?? 0) + 1);
  }
  const participants = owners.map(owner => {
    const setting = settings.find(s => s.ownerId === owner.id);
    const dropsUsed = Math.max(0, (counts.get(owner.id) ?? 0) + (setting?.countAdjustment ?? 0));
    if (dropsUsed > MAX_DROPS && !setting) throw new Error("Transaction history exceeds the participant limit");
    return {
      ownerId: owner.id, ownerName: owner.name,
      dropsUsed, dropsLeft: Math.max(0, (setting?.transactionLimit ?? MAX_DROPS) - dropsUsed),
      amountOwing: (unpaid.get(owner.id) ?? 0) * TRANSACTION_COST,
      transactionSpend: (counts.get(owner.id) ?? 0) * TRANSACTION_COST,
    };
  });
  const totalPoolEarnings = BASE_POOL_EARNINGS + completed.length * TRANSACTION_COST;
  const payouts = [65, 25, 10].map((percentage, index) => {
    const amount = totalPoolEarnings * percentage / 100;
    return { place: index + 1, percentage, amount, twoWayTieAmount: amount / 2 };
  });
  return {
    baseEarnings: BASE_POOL_EARNINGS,
    totalPoolEarnings,
    payouts,
    totalCompletedTransactions: completed.length,
    transactionCost: TRANSACTION_COST,
    maxDrops: MAX_DROPS,
    participants,
  };
}
