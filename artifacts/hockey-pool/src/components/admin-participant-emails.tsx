import { useAuth } from '@clerk/react';
import { useGetAdminParticipantEmails, getGetAdminParticipantEmailsQueryKey } from '@workspace/api-client-react';

/** Mounted only after current-user administrator access has been confirmed. */
export function AdminParticipantEmails() {
  const { userId } = useAuth();
  const query = useGetAdminParticipantEmails({ query: {
    queryKey: [...getGetAdminParticipantEmailsQueryKey(), userId],
    enabled: Boolean(userId), staleTime: 0, gcTime: 0, retry: false,
    refetchOnMount: 'always', refetchOnWindowFocus: true,
  } });
  return <section className="mt-5 overflow-hidden rounded-2xl border border-[#ded8ca] bg-[#faf8f1]" aria-labelledby="participant-email-list" data-testid="panel-participant-emails">
    <div className="border-b border-[#e1dccf] p-5">
      <h2 id="participant-email-list" className="display text-2xl font-bold text-[#173a4c]">Participant email list</h2>
      <p className="mt-1 text-sm text-[#67767c]">Private backend account links · administrator only · read only. These links do not create accounts or confirm that participants have signed up.</p>
    </div>
    {query.isLoading ? <p className="p-5 text-sm" role="status">Loading participant emails…</p>
      : query.isError ? <div className="p-5 text-sm" role="alert">Participant emails could not load. <button className="ml-1 min-h-11 font-bold underline" onClick={() => query.refetch()}>Retry</button></div>
      : query.data?.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm" data-testid="table-participant-emails">
        <caption className="sr-only">Private participant emails and pool roles</caption>
        <thead><tr className="border-b border-[#e1dccf] text-xs text-[#67767c]"><th className="px-4 py-3">Participant</th><th className="px-4 py-3">Email address</th><th className="px-4 py-3">Role</th></tr></thead>
        <tbody>{query.data.map(row => <tr key={row.ownerId} className="border-b border-[#ebe6db] last:border-0" data-testid={`email-row-${row.ownerId}`}>
          <th scope="row" className="px-4 py-3 font-semibold text-[#254456]">{row.ownerName}</th>
          <td className="break-all px-4 py-3 text-[#254456]">{row.email ?? 'Not configured'}</td>
          <td className="px-4 py-3 text-[#67767c]">{row.isAdmin ? 'Participant · Admin' : 'Participant'}</td>
        </tr>)}</tbody>
      </table></div> : <p className="p-5 text-sm">No participant email links are configured.</p>}
  </section>;
}