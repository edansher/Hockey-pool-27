import { getGetDailyReportHealthQueryKey, useGetDailyReportHealth } from '@workspace/api-client-react';
import { useAuth } from '@clerk/react';

const reasons = {
  database_unavailable: 'Database temporarily unavailable',
  scoring_not_verified: 'Waiting for verified scoring',
  report_generation_failed: 'Report generation could not finish',
  publication_failed: 'Publication could not finish',
  unknown: 'Cause not yet known',
};
const time = (value: string | null) => value
  ? new Date(value).toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' })
  : 'Not yet known';

/** Mounted only within the verified administrator surface, independently of management data. */
export function DailyReportHealthNotice() {
  const { userId } = useAuth();
  const q = useGetDailyReportHealth({ query: { queryKey: [...getGetDailyReportHealthQueryKey(), userId], refetchInterval: 60_000, staleTime: 0, refetchOnMount: 'always' } });
  const h = q.data;
  const delayed = h?.status === 'delayed';
  return <section role={delayed || q.isError ? 'alert' : 'status'} data-testid="admin-report-health"
    className={`mt-5 rounded-xl border p-4 text-sm ${delayed || q.isError ? 'border-[#e3b8aa] bg-[#fbede7] text-[#874838]' : 'border-[#ded8ca] bg-[#faf8f1] text-[#254456]'}`}>
    <h2 className="font-bold">{delayed ? 'Morning report delayed' : 'Morning report health'}</h2>
    {q.isError ? <p className="mt-2">Report health could not be refreshed. <button type="button" onClick={() => void q.refetch()} className="font-bold underline">Retry</button></p>
      : !h ? <p className="mt-2">Checking publication status…</p> : <>
        <p className="mt-2">{h.status === 'published' ? "Today's report is published." :
          h.status === 'scheduled' ? 'Scheduled for 8:00 a.m. Toronto.' :
          delayed ? `Still pending after 8:00 a.m. Toronto and the ${h.graceMinutes}-minute retry grace period.` :
          'Publication pending; the retry grace period is still active.'}
          {' '}{h.status !== 'published' && 'Automatic retries continue; only verified scoring can be published.'}</p>
        {!h.publicationVerified && <p className="mt-2">The database could not confirm today's publication. These are the last known observations.</p>}
        <dl className="mt-3 grid gap-1">
          <div><dt className="inline font-semibold">Last report attempt: </dt><dd className="inline">{time(h.lastAttemptAt)}</dd></div>
          <div><dt className="inline font-semibold">Last successful publication: </dt><dd className="inline">{time(h.lastPublishedAt)}</dd></div>
          {h.failureCategory && <div><dt className="inline font-semibold">Failure category: </dt><dd className="inline">{reasons[h.failureCategory]}</dd></div>}
        </dl>
        <p className="mt-2 text-xs">Times are Toronto time. Attempt observations began {time(h.observedSince)} and reset when the server restarts.</p>
      </>}
  </section>;
}
