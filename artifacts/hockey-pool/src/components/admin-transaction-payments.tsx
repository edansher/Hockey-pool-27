import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetTransactions, useUpdateTransactionPayment, getGetTransactionsQueryKey,
  getGetTransactionSummaryQueryKey, formatTransactionTime, type Transaction,
} from '@workspace/api-client-react';
import { TransactionPaymentBadge } from './transaction-payment-badge';

/** Only mounted for the current, server-verified pool administrator. */
export function AdminTransactionPayments() {
  const client = useQueryClient();
  const query = useGetTransactions({ query: { queryKey: getGetTransactionsQueryKey(), refetchInterval: 10000, staleTime: 0, refetchOnMount: 'always' } });
  const mutation = useUpdateTransactionPayment();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function update(row: Transaction) {
    setMessage(''); setError('');
    try {
      const saved = await mutation.mutateAsync({ id: row.id, data: { paid: !row.paid } });
      client.setQueryData<Transaction[]>(getGetTransactionsQueryKey(), old => old?.map(t => t.id === saved.id ? saved : t));
      await Promise.all([
        client.invalidateQueries({ queryKey: getGetTransactionsQueryKey() }),
        client.invalidateQueries({ queryKey: getGetTransactionSummaryQueryKey() }),
      ]);
      setMessage(`${saved.ownerName}'s drop marked ${saved.paid ? 'Paid' : 'Not paid'}.`);
    } catch {
      void client.invalidateQueries({ queryKey: getGetTransactionsQueryKey() });
      void client.invalidateQueries({ queryKey: getGetTransactionSummaryQueryKey() });
      setError('Payment status could not be confirmed. Refresh the status before trying again.');
    }
  }
  return <section className="mt-5 overflow-hidden rounded-2xl border border-[#ded8ca] bg-[#faf8f1]" aria-labelledby="admin-payments-title" data-testid="panel-admin-payments">
    <div className="border-b border-[#e1dccf] p-5">
      <h2 id="admin-payments-title" className="display text-2xl font-bold text-[#173a4c]">Transaction payments</h2>
      <p className="mt-1 text-sm text-[#67767c]">Mark a completed drop’s $50 fee Paid after receiving it. Mark Not paid to correct a mistake. This records payment received; it does not charge anyone. Drop counts, scoring and the total pot stay unchanged.</p>
    </div>
    {message && <p className="px-5 pt-4 text-sm font-semibold text-[#2f6a55]" role="status">{message}</p>}
    {error && <p className="px-5 pt-4 text-sm font-semibold text-[#9b4330]" role="alert">{error} <button onClick={() => query.refetch()} className="min-h-11 underline">Refresh statuses</button></p>}
    {query.isLoading ? <p className="p-5" role="status">Loading transaction payments…</p>
      : query.isError ? <p className="p-5" role="alert">Transaction payments could not load. <button onClick={() => query.refetch()} className="min-h-11 font-bold underline">Retry</button></p>
      : !query.data?.length ? <p className="p-5 text-sm">No completed transactions yet.</p>
      : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <caption className="sr-only">Administrator controls for each completed drop fee</caption>
        <thead><tr className="border-b border-[#e1dccf] text-xs text-[#67767c]"><th className="p-4">Participant / drop</th><th className="p-4">Paid / not paid</th><th className="p-4">Change status</th></tr></thead>
        <tbody>{query.data.map(row => <tr key={row.id} className="border-b border-[#ebe6db] last:border-0" data-testid={`admin-payment-row-${row.id}`}>
          <td className="p-4"><strong>{row.ownerName}</strong><div className="mt-1">Dropped {row.outgoingPlayerName} → {row.incomingPlayerName}</div><div className="mt-1 text-xs text-[#67767c]">{formatTransactionTime(row.effectiveAt)}</div></td>
          <td className="p-4"><TransactionPaymentBadge paid={row.paid}/></td>
          <td className="p-4"><button type="button" disabled={mutation.isPending} onClick={() => update(row)} data-testid={`button-payment-${row.id}`} aria-label={`Mark ${row.ownerName}'s drop of ${row.outgoingPlayerName} ${row.paid ? 'Not paid' : 'Paid'}`} className="min-h-11 whitespace-nowrap rounded-lg bg-[#173a4c] px-3 py-2 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-50">{mutation.isPending && mutation.variables?.id === row.id ? 'Saving…' : row.paid ? 'Mark Not paid' : 'Mark Paid'}</button></td>
        </tr>)}</tbody>
      </table></div>}
  </section>;
}