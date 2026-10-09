import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, Plus, Save, Send, Trash2 } from 'lucide-react';
import { getGetAdminPoolPollsQueryKey, useDeletePoolPoll, useGetAdminPoolPolls, usePreviewPoolPoll, usePublishPoolPoll, useSavePoolPollDraft, useUpdatePoolPoll, type PoolPoll, type PoolPollDraft } from '@workspace/api-client-react';
import { PollCardContent } from '@/components/pool-poll-card';

type EditableQuestion = { id: string; prompt: string; options: { id: string; label: string }[] };
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const blankQuestion = (): EditableQuestion => ({ id: uid('question'), prompt: '', options: [{ id: uid('option-a'), label: '' }, { id: uid('option-b'), label: '' }] });
const toDraft = (poll: PoolPoll): PoolPollDraft => ({ id: poll.id, title: poll.title, questions: poll.questions.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options.map(({ id, label }) => ({ id, label })) })) });
const errorMessage = (error: unknown, fallback: string) => error instanceof Error && error.message ? `${fallback} ${error.message}` : fallback;
const pollCaches = (query: { queryKey: readonly unknown[] }) => String(query.queryKey[0] ?? '').includes('/poll/');

export function AdminPoolPolls() {
  const client = useQueryClient();
  const pollsQuery = useGetAdminPoolPolls({ query: { queryKey: getGetAdminPoolPollsQueryKey(), staleTime: 0 } });
  const save = useSavePoolPollDraft();
  const update = useUpdatePoolPoll();
  const remove = useDeletePoolPoll();
  const previewMutation = usePreviewPoolPoll();
  const publish = usePublishPoolPoll();
  const [title, setTitle] = useState('What do you think?');
  const [questions, setQuestions] = useState<EditableQuestion[]>([blankQuestion()]);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<PoolPoll | null>(null);
  const body = useMemo<PoolPollDraft>(() => ({ ...(editingId ? { id: editingId } : {}), title: title.trim(), questions: questions.map((q) => ({ id: q.id, prompt: q.prompt.trim(), options: q.options.map((o) => ({ id: o.id, label: o.label.trim() })) })) }), [title, questions, editingId]);
  const snapshot = JSON.stringify(body);
  const allPolls = pollsQuery.data?.polls ?? [];
  const published = allPolls.filter((p) => p.status === 'published');
  const drafts = allPolls.filter((p) => p.status !== 'published');
  const currentPoll = allPolls.find((p) => p.id === editingId);
  const isPublishedEdit = currentPoll?.status === 'published';
  const busy = save.isPending || update.isPending || remove.isPending || publish.isPending || previewMutation.isPending;
  const isValid = body.title.length > 0 && body.questions.length > 0 && body.questions.every((q) => q.prompt && q.options.length >= 2 && q.options.every((o) => o.label));
  const refreshPolls = async () => {
    await client.invalidateQueries({ queryKey: getGetAdminPoolPollsQueryKey() });
    await client.invalidateQueries({ predicate: pollCaches });
  };
  const loadPoll = (poll: PoolPoll) => {
    if (busy) return;
    const value = toDraft(poll);
    setTitle(value.title);
    setQuestions(value.questions.map((q) => ({ ...q, options: q.options.map((o) => ({ ...o })) })));
    setEditingId(poll.id);
    setSavedSnapshot(JSON.stringify(value));
    setPreview(null);
    setError('');
    setNotice(poll.status === 'published' ? 'Published poll loaded for wording corrections.' : 'Draft loaded.');
  };
  const newDraft = () => {
    if (busy) return;
    setTitle('What do you think?');
    setQuestions([blankQuestion()]);
    setEditingId(undefined);
    setSavedSnapshot('');
    setPreview(null);
    setError('');
    setNotice('New daily poll draft.');
  };
  const saveDraft = async () => {
    if (busy) return;
    if (!isValid) { setError('Add a title, question, and at least two answer options before saving.'); return; }
    setError(''); setNotice('');
    try {
      if (isPublishedEdit) {
        const result = await update.mutateAsync({ data: body });
        setEditingId(result.id);
        setSavedSnapshot(JSON.stringify(toDraft(result)));
        setNotice('Published poll wording saved. Its publication date and votes are unchanged.');
      } else {
        const result = await save.mutateAsync({ data: body });
        setEditingId(result.id);
        setSavedSnapshot(JSON.stringify({ id: result.id, title: body.title, questions: body.questions }));
        setNotice('Draft saved.');
      }
      await refreshPolls();
    } catch (e) {
      setError(errorMessage(e, isPublishedEdit ? 'Published poll changes could not be saved. Your unsaved wording is still here.' : 'The draft could not be saved. Your unsaved wording is still here; check your connection and retry.'));
    }
  };
  const deletePoll = async (poll: PoolPoll) => {
    if (busy) return;
    const confirmed = window.confirm(`Delete “${poll.title}”? This removes the entire poll from admin and participant views. Saved votes are retained privately for safety, and its published date remains reserved.`);
    if (!confirmed) return;
    setError(''); setNotice('');
    try {
      const result = await remove.mutateAsync({ data: { pollId: poll.id } });
      if (!result.deleted) throw new Error('The server did not confirm deletion.');
      if (editingId === poll.id) {
        setTitle('What do you think?');
        setQuestions([blankQuestion()]);
        setEditingId(undefined);
        setSavedSnapshot('');
        setPreview(null);
      }
      setNotice('Poll removed from admin and participant views. Its votes remain privately retained and the published date stays reserved.');
      await refreshPolls();
    } catch (e) {
      setError(errorMessage(e, 'Deletion could not be confirmed. Refresh the poll list and retry.'));
    }
  };
  const previewPoll = async () => {
    if (busy) return;
    if (!isValid) { setError('Complete the title, question, and answer options to preview.'); return; }
    setError('');
    try { setPreview(await previewMutation.mutateAsync({ data: body })); }
    catch (e) { setError(errorMessage(e, 'Preview is temporarily unavailable. Your wording is unchanged.')); }
  };
  const publishPoll = async () => {
    const saved = allPolls.find((p) => p.id === editingId && p.status === 'draft');
    if (!saved || savedSnapshot !== snapshot) { setError('Save this exact wording as a draft before publishing.'); return; }
    if (busy || !window.confirm('Publish this poll for today? A poll can be published once per Toronto calendar day.')) return;
    setError(''); setNotice('');
    try {
      const result = await publish.mutateAsync({ data: { pollId: saved.id } });
      setNotice(`Published for ${result.publicationDate ?? 'today'}.`);
      setPreview(null);
      setSavedSnapshot('');
      await refreshPolls();
    } catch (e) { setError(errorMessage(e, 'This poll could not be published. A poll may already be published for today.')); }
  };
  const updateQuestion = (id: string, patch: Partial<EditableQuestion>) => { setPreview(null); setQuestions((items) => items.map((q) => q.id === id ? { ...q, ...patch } : q)); };
  const removeQuestion = (id: string) => { setPreview(null); setQuestions((items) => items.length > 1 ? items.filter((q) => q.id !== id) : items); };
  const addQuestion = () => { setPreview(null); setQuestions((items) => [...items, blankQuestion()]); };
  const appendOption = (qid: string) => updateQuestion(qid, { options: [...(questions.find((q) => q.id === qid)?.options ?? []), { id: uid('option'), label: '' }] });
  const changeOption = (qid: string, oid: string, label: string) => { setPreview(null); setQuestions((items) => items.map((q) => q.id === qid ? { ...q, options: q.options.map((o) => o.id === oid ? { ...o, label } : o) } : q)); };
  const listActions = (poll: PoolPoll) => <span className="inline-flex shrink-0 gap-2"><button type="button" disabled={busy} onClick={() => loadPoll(poll)} className="rounded-md border border-[#d9d2c4] px-2.5 py-1.5 text-xs font-semibold text-[#14546a] disabled:opacity-45">Edit</button><button type="button" disabled={busy} onClick={() => void deletePoll(poll)} className="rounded-md border border-[#e3b8aa] px-2.5 py-1.5 text-xs font-semibold text-[#9b4330] disabled:opacity-45">Delete</button></span>;

  return <section className="mt-6 rounded-2xl border border-[#ded8ca] bg-[#faf8f1] p-5 md:p-6" data-testid="admin-polls">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="mono text-[10px] font-semibold uppercase tracking-[.18em] text-[#bf583d]">Pool room · daily question</div><h2 className="display mt-1 text-3xl font-bold text-[#173a4c]">Polls</h2></div><button type="button" disabled={busy} onClick={newDraft} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#d9d2c4] px-3 text-sm font-semibold text-[#173a4c] disabled:opacity-45"><Plus size={16}/>New draft</button></div>
    {pollsQuery.isError && <p role="alert" className="mt-4 text-sm text-[#874838]">Poll administration could not load. <button className="underline" onClick={() => void pollsQuery.refetch()}>Retry</button></p>}
    {drafts.length > 0 && <div className="mt-4 space-y-2">{drafts.map((p) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e1dccf] px-3 py-2"><span className="min-w-0 text-xs font-semibold text-[#53666e]">{p.title} · {p.legacy ? 'legacy draft' : 'draft'}</span>{listActions(p)}</div>)}</div>}
    <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_.9fr]">
      <div className="space-y-4">
        <label className="block text-xs font-semibold text-[#53666e]">Poll card title<input value={title} disabled={busy} onChange={(e) => { setTitle(e.target.value); setPreview(null); }} className="mt-1 min-h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4eb] px-3 text-sm text-[#203443] outline-[#14546a] disabled:opacity-70" /></label>
        {questions.map((q, qi) => <fieldset key={q.id} className="rounded-xl border border-[#e1dccf] bg-[#f6f3ea] p-4"><div className="mb-2 flex items-center justify-between"><legend className="mono text-[10px] uppercase tracking-[.13em] text-[#82908c]">Question {qi + 1}</legend>{questions.length > 1 && <button type="button" disabled={busy || !!currentPoll?.structureLocked} onClick={() => removeQuestion(q.id)} className="text-xs text-[#9b4330] underline disabled:opacity-40">Remove</button>}</div><input aria-label={`Question ${qi + 1}`} value={q.prompt} disabled={busy} onChange={(e) => updateQuestion(q.id, { prompt: e.target.value })} placeholder="Write a question" className="min-h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#faf8f1] px-3 text-sm outline-[#14546a] disabled:opacity-70" /><div className="mt-3 space-y-2">{q.options.map((option, oi) => <div className="flex gap-2" key={option.id}><input aria-label={`Question ${qi + 1} answer ${oi + 1}`} value={option.label} disabled={busy} onChange={(e) => changeOption(q.id, option.id, e.target.value)} placeholder={`Answer option ${oi + 1}`} className="min-h-10 min-w-0 flex-1 rounded-lg border border-[#d9d2c4] bg-[#faf8f1] px-3 text-sm outline-[#14546a] disabled:opacity-70" />{q.options.length > 2 && <button type="button" disabled={busy || !!currentPoll?.structureLocked} aria-label="Remove answer option" onClick={() => updateQuestion(q.id, { options: q.options.filter((o) => o.id !== option.id) })} className="px-2 text-[#9b4330] disabled:opacity-40">×</button>}</div>)}</div><button type="button" disabled={busy || !!currentPoll?.structureLocked} onClick={() => appendOption(q.id)} className="mt-3 text-xs font-semibold text-[#14546a] underline disabled:opacity-40">Add answer option</button></fieldset>)}
        <button type="button" disabled={busy || !!currentPoll?.structureLocked} onClick={addQuestion} className="text-xs font-semibold text-[#14546a] underline disabled:opacity-40">Add question</button>
        {currentPoll?.structureLocked && <p className="text-xs text-[#72807d]">Votes have been recorded. Question and option structure is locked; wording corrections remain available.</p>}
        {currentPoll?.participants?.length ? <div className="rounded-lg border border-[#e1dccf] bg-[#f6f3ea] p-3"><h3 className="mono text-[10px] font-semibold uppercase tracking-[.13em] text-[#82908c]">Participants who voted</h3><p className="mt-1 text-xs leading-5 text-[#53666e]">{currentPoll.participants.map((person) => person.name).join(' · ')}</p></div> : currentPoll && <div className="rounded-lg border border-[#e1dccf] bg-[#f6f3ea] p-3"><h3 className="mono text-[10px] font-semibold uppercase tracking-[.13em] text-[#82908c]">Participants who voted</h3><p className="mt-1 text-xs text-[#72807d]">No participants have voted yet.</p></div>}
        <div className="flex flex-wrap gap-2 border-t border-[#e1dccf] pt-4"><button type="button" onClick={() => void saveDraft()} disabled={!isValid || busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#173a4c] px-4 text-sm font-bold text-[#f5f0e5] disabled:opacity-45"><Save size={15}/>{busy && (save.isPending || update.isPending) ? 'Saving…' : isPublishedEdit ? 'Save changes' : 'Save draft'}</button><button type="button" onClick={() => void previewPoll()} disabled={!isValid || busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#d9d2c4] px-4 text-sm font-semibold text-[#173a4c] disabled:opacity-45"><Eye size={15}/>Preview Poll</button>{!isPublishedEdit && <button type="button" onClick={() => void publishPoll()} disabled={!editingId || savedSnapshot !== snapshot || busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#e57955] px-4 text-sm font-bold text-[#173a4c] disabled:opacity-45"><Send size={15}/>Publish Poll</button>}{currentPoll && <button type="button" disabled={busy} onClick={() => void deletePoll(currentPoll)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#e3b8aa] px-4 text-sm font-semibold text-[#9b4330] disabled:opacity-45"><Trash2 size={15}/>Delete poll</button>}</div>
        {notice && <p className="text-sm text-[#2f745e]" role="status">{notice}</p>}{error && <p className="rounded-lg border border-[#e3b8aa] bg-[#fbede7] p-3 text-sm text-[#874838]" role="alert">{error}</p>}
      </div>
      <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#82908c]"><Eye size={14}/>Poll preview</div>{preview ? <div className="rounded-2xl border border-[#ded8ca] bg-[#faf8f1] p-5"><PollCardContent poll={preview} interactive={false} showResults={false}/><p className="mt-4 border-t border-[#e4dfd2] pt-3 text-xs text-[#72807d]">Preview only · not published · no vote will be recorded.</p></div> : <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-[#cfc8b9] bg-[#f6f3ea] p-5 text-center text-sm text-[#72807d]">Preview Poll to see the question in the same card participants will use.</div>}</div>
    </div>
    <div className="mt-6 border-t border-[#e1dccf] pt-4"><h3 className="mono text-[10px] font-semibold uppercase tracking-[.15em] text-[#82908c]">Published poll archive</h3>{published.length ? <div className="mt-2 divide-y divide-[#ebe6db]">{published.map((p) => <div key={p.id} className="py-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-3"><span className="font-semibold text-[#294253]">{p.publicationDate || (p.legacy ? 'Legacy archive · undated' : 'Date unavailable')} · {p.title}</span><div className="flex items-center gap-3"><span className="text-xs text-[#72807d]">{p.respondentCount} votes · published</span>{listActions(p)}</div></div>{p.legacy && <details className="mt-2 rounded-lg border border-[#e1dccf] bg-[#f6f3ea] p-3"><summary className="cursor-pointer text-xs font-semibold text-[#14546a]">Legacy record · ID {p.id}</summary><div className="mt-3"><PollCardContent poll={p} showResults/></div></details>}</div>)}</div> : <p className="mt-2 text-sm text-[#72807d]">No published polls in the archive yet.</p>}</div>
  </section>;
}
