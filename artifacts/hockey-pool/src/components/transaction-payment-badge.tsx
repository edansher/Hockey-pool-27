/** Public receipt status; only the verified administrator can change it. */
export function TransactionPaymentBadge({ paid }: { paid: boolean }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${paid ? 'bg-[#e2efe5] text-[#2f6a55]' : 'bg-[#f8e5df] text-[#9b4330]'}`}>{paid ? 'Paid' : 'Not paid'}</span>;
}
