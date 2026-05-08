import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Trash2, FolderOpen, Wand2, Loader2, AlertCircle,
  Clock, FileText, BarChart, History, ChevronDown, Play, RefreshCw,
  BookOpen, Copy, Printer, Plus, Pencil, X, Check, MessageCircle
} from 'lucide-react';
import { getApplication, updateApplication, deleteApplication, getApplicationVersions, getVaultDocuments, regenerateOdt, getInterviewPrep, generateInterviewPrep, updateInterviewPrepNotes, getApplicationNotes, createApplicationNote, updateApplicationNote, deleteApplicationNote } from '@/api';
import type { Application, ApplicationNote, GenerationLog, VaultDocument, InterviewPrep, InterviewPrepQuestion, InterviewPrepQuestionToAsk } from '@/types';
import StatusBadge from '@/components/StatusBadge';
import FitScoreGauge from '@/components/FitScoreGauge';
import MarkdownPreview from '@/components/MarkdownPreview';
import StreamingText from '@/components/StreamingText';
import { useStream } from '@/hooks/useStream';
import { useToast } from '@/hooks/useToast';
import ToastStack from '@/components/Toast';
import { useTheme } from '@/contexts/ThemeContext';
import Modal from '@/components/Modal';

type Tab = 'cover_letter' | 'job_description' | 'analysis' | 'history' | 'prep';

const STATUS_OPTIONS = ['draft', 'applied', 'interview', 'offer', 'rejected', 'withdrawn'];

function HistoryTab({ logs }: { logs: GenerationLog[] }) {
  const { theme } = useTheme();
  const [promptLog, setPromptLog] = useState<GenerationLog | null>(null);

  const parsed = promptLog?.prompt_summary
    ? (() => { try { return JSON.parse(promptLog.prompt_summary) as { system?: string; user?: string }; } catch { return null; } })()
    : null;

  return (
    <>
      <div className="space-y-3">
        {logs.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-8">No generation history</p>
        ) : (
          logs.map(log => {
            const hasPrompt = !!log.prompt_summary;
            return (
              <div key={log.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">v{log.version}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                      {log.model}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {hasPrompt && (
                      <button
                        onClick={() => setPromptLog(log)}
                        className="text-xs font-medium flex items-center gap-1"
                        style={{ color: theme.accent }}
                      >
                        <FileText className="w-3 h-3" /> View prompt
                      </button>
                    )}
                    <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                      <Clock className="w-3 h-3" />
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">{log.filename}</p>
              </div>
            );
          })
        )}
      </div>

      {promptLog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="flex flex-col w-full sm:max-w-3xl mx-4 rounded-2xl shadow-2xl overflow-hidden" style={{ background: theme.surface, border: `1px solid ${theme.border}`, maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <div>
                <h3 className="font-bold text-sm" style={{ color: theme.text }}>Request sent to AI</h3>
                <p className="text-xs mt-0.5" style={{ color: theme.text2 }}>v{promptLog.version} · {promptLog.model}</p>
              </div>
              <button onClick={() => setPromptLog(null)} style={{ color: theme.text2 }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-5">
              {parsed?.system && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: theme.text2 }}>System prompt</p>
                  <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words p-4 rounded-xl" style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text, fontFamily: 'monospace' }}>{parsed.system}</pre>
                </div>
              )}
              {parsed?.user && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: theme.text2 }}>User prompt</p>
                  <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words p-4 rounded-xl" style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text, fontFamily: 'monospace' }}>{parsed.user}</pre>
                </div>
              )}
              {!parsed && (
                <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words p-4 rounded-xl" style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text, fontFamily: 'monospace' }}>{promptLog.prompt_summary}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ApplicationDetailPage() {
  const { theme } = useTheme();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toasts, addToast, removeToast } = useToast();

  const [app, setApp] = useState<Application | null>(null);
  const [logs, setLogs] = useState<GenerationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('cover_letter');
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [notes, setNotes] = useState<ApplicationNote[]>([]);
  const [noteForm, setNoteForm] = useState({ headline: '', body: '' });
  const [noteFormOpen, setNoteFormOpen] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [editingNote, setEditingNote] = useState<ApplicationNote | null>(null);
  const [editForm, setEditForm] = useState({ headline: '', body: '' });
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [regeneratingOdt, setRegeneratingOdt] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [cvDocuments, setCvDocuments] = useState<VaultDocument[]>([]);
  const [selectedCvId, setSelectedCvId] = useState('');

  const refineStream = useStream();
  const analyzeStream = useStream();
  const [analyzeScore, setAnalyzeScore] = useState<number | null>(null);

  // ── Interview prep state ───────────────────────────────────────────────
  const [prep, setPrep] = useState<InterviewPrep | null>(null);
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepGenerating, setPrepGenerating] = useState(false);
  const [prepStreamText, setPrepStreamText] = useState('');
  const [prepError, setPrepError] = useState<string | null>(null);
  const [prepNotes, setPrepNotes] = useState('');
  const [prepNotesSaving, setPrepNotesSaving] = useState(false);
  const [prepNotesSaved, setPrepNotesSaved] = useState(false);
  const [showRegenerateWarning, setShowRegenerateWarning] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [{ application, logs: appLogs }, allVersions, docs, appNotes] = await Promise.all([
        getApplication(id),
        getApplicationVersions(id),
        getVaultDocuments(),
        getApplicationNotes(id),
      ]);
      setApp(application);
      setLogs(allVersions);
      setNotes(appNotes);

      const cvDocs = docs.filter(d => d.doc_type === 'cv');
      setCvDocuments(cvDocs);
      const defaultCv = cvDocs.find(d => d.is_default);
      setSelectedCvId(defaultCv?.id || cvDocs[0]?.id || '');

      if (allVersions.length > 0) {
        setSelectedVersion(allVersions[0].id);
      }

      // Load existing interview prep if status qualifies
      if (application.status === 'interview' || application.status === 'offer') {
        setPrepLoading(true);
        getInterviewPrep(id).then(existing => {
          setPrep(existing);
          setPrepNotes(existing.user_notes || '');
        }).catch(() => {
          // 404 = no prep yet, that's fine
        }).finally(() => setPrepLoading(false));
      }
    } catch (err) {
      addToast('Failed to load application', 'error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (status: string) => {
    if (!id || !app) return;
    try {
      const updated = await updateApplication(id, { status: status as Application['status'] });
      setApp(updated);
    } catch (err) {
      addToast('Failed to update status', 'error');
    }
  };

  const handleCreateNote = async () => {
    if (!id || !noteForm.headline.trim()) return;
    setNoteSaving(true);
    try {
      const note = await createApplicationNote(id, noteForm);
      setNotes(prev => [note, ...prev]);
      setNoteForm({ headline: '', body: '' });
      setNoteFormOpen(false);
      addToast('Note added', 'success');
    } catch {
      addToast('Failed to save note', 'error');
    } finally {
      setNoteSaving(false);
    }
  };

  const handleUpdateNote = async () => {
    if (!id || !editingNote) return;
    setNoteSaving(true);
    try {
      const updated = await updateApplicationNote(id, editingNote.id, editForm);
      setNotes(prev => prev.map(n => n.id === editingNote.id ? updated : n));
      setEditingNote(null);
      addToast('Note updated', 'success');
    } catch {
      addToast('Failed to update note', 'error');
    } finally {
      setNoteSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!id) return;
    try {
      await deleteApplicationNote(id, noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
      addToast('Note deleted', 'success');
    } catch {
      addToast('Failed to delete note', 'error');
    }
  };


  const handleDelete = () => {
    if (!id) return;
    setShowDeleteModal(true);
  };

  const confirmDelete = async (deleteFolder: boolean) => {
    if (!id) return;
    setShowDeleteModal(false);
    setDeleting(true);
    try {
      await deleteApplication(id, deleteFolder);
      navigate('/history');
    } catch {
      addToast('Failed to delete', 'error');
      setDeleting(false);
    }
  };

  const handleAnalyze = () => {
    if (!id || !selectedCvId) return;
    setAnalyzeScore(null);
    analyzeStream.start('/analyze', { applicationId: id, cvDocumentId: selectedCvId }, (payload) => {
      if (typeof payload.fitScore === 'number') setAnalyzeScore(payload.fitScore);
      load();
    });
  };

  const handleRefine = () => {
    if (!id || !refineInstruction.trim()) return;
    refineStream.start('/refine', { applicationId: id, instruction: refineInstruction }, () => {
      addToast('Refinement complete', 'success');
      load(); // reload to get new version
    });
  };

  const handleRegenerateOdt = async () => {
    if (!id) return;
    setRegeneratingOdt(true);
    try {
      const result = await regenerateOdt(id);
      const msg = result.pdfFile
        ? `Output files recreated (ODT + PDF + attachments)`
        : `Output files recreated (ODT + attachments, PDF skipped — LibreOffice not available)`;
      addToast(msg, result.pdfFile ? 'success' : 'info');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to regenerate ODT', 'error');
    } finally {
      setRegeneratingOdt(false);
    }
  };

  const handleGeneratePrep = async () => {
    if (!id) return;
    setPrepGenerating(true);
    setPrepStreamText('');
    setPrepError(null);
    setShowRegenerateWarning(false);

    const controller = new AbortController();
    try {
      const response = await generateInterviewPrep(id, selectedCvId || undefined, controller.signal);
      if (!response.ok || !response.body) {
        let errMsg = 'Failed to start generation';
        try {
          const errData = await response.json();
          if (errData?.error) errMsg = errData.error;
        } catch { /* ignore */ }
        setPrepError(errMsg);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let receivedDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.token) {
              fullText += payload.token;
              setPrepStreamText(fullText);
            }
            if (payload.done) {
              receivedDone = true;
              fullText = payload.fullText || fullText;
              try {
                const parsed = JSON.parse(fullText) as { questions: InterviewPrepQuestion[]; questions_to_ask: InterviewPrepQuestionToAsk[] };
                setPrep(prev => ({
                  application_id: id,
                  questions: parsed.questions,
                  questions_to_ask: parsed.questions_to_ask ?? [],
                  user_notes: prev?.user_notes ?? prepNotes ?? null,
                  model: '',
                  created_at: Date.now(),
                  updated_at: Date.now(),
                }));
                setPrepStreamText('');
              } catch {
                setPrepError('Could not parse response — try again.');
                setPrepStreamText('');
              }
            }
            if (payload.error) {
              receivedDone = true;
              setPrepError(payload.error);
            }
          } catch { /* ignore malformed */ }
        }
      }

      if (!receivedDone) {
        setPrepError('Generation failed — no response received. Check your AI settings.');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setPrepError('Generation failed — try again.');
      }
    } finally {
      setPrepGenerating(false);
    }
  };

  const handleSavePrepNotes = async () => {
    if (!id || !prep) return;
    setPrepNotesSaving(true);
    setPrepNotesSaved(false);
    try {
      await updateInterviewPrepNotes(id, prepNotes);
      setPrepNotesSaved(true);
      setTimeout(() => setPrepNotesSaved(false), 2000);
    } catch {
      addToast('Failed to save notes', 'error');
    } finally {
      setPrepNotesSaving(false);
    }
  };

  const handleCopyPrep = () => {
    if (!prep) return;
    const questionsSection = `## Questions you'll likely be asked\n\n` + prep.questions.map((q, i) =>
      `### Q${i + 1}: ${q.question}\n${q.talking_points.map(tp => `- ${tp}`).join('\n')}`
    ).join('\n\n');
    const askSection = prep.questions_to_ask?.length
      ? `\n\n## Questions to ask the interviewer\n\n` + prep.questions_to_ask.map((q, i) =>
          `### ${i + 1}. ${q.question}\n*${q.purpose}*`
        ).join('\n\n')
      : '';
    navigator.clipboard.writeText(questionsSection + askSection).then(() => addToast('Copied to clipboard', 'success'));
  };

  const selectedLog = logs.find(l => l.id === selectedVersion) || logs[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Application not found</p>
        <button onClick={() => navigate('/history')} className="btn-secondary mt-4">Back to History</button>
      </div>
    );
  }

  return (
    <>
    <div className="p-8 max-w-5xl mx-auto">
      <ToastStack toasts={toasts} onRemove={removeToast} />

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <button
          onClick={() => navigate('/history')}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mt-1"
        >
          <ArrowLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: theme.text }}>{app.company}</h1>
            <div className="relative inline-flex items-center">
              <select
                value={app.status}
                onChange={e => handleStatusChange(e.target.value)}
                className="appearance-none pl-2.5 pr-7 py-0.5 rounded-full text-xs font-medium cursor-pointer border-0 focus:ring-2 focus:ring-primary-500"
                style={{
                  backgroundColor: 'transparent',
                  color: 'inherit',
                }}
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
              <StatusBadge status={app.status} className="pointer-events-none absolute inset-0" />
              <ChevronDown className="pointer-events-none absolute right-1.5 w-3 h-3 opacity-60" />
            </div>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mt-0.5">{app.role}</p>
          {app.job_url && (
            <a href={app.job_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-0.5 inline-block truncate max-w-md">
              {app.job_url}
            </a>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {app.fit_score !== undefined && app.fit_score !== null && (
            <FitScoreGauge score={app.fit_score} size={80} />
          )}
          <div className="flex gap-2">
              <button
              onClick={handleDelete}
              disabled={deleting}
              className="btn-danger flex items-center gap-2 text-sm"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="label mb-0">Notes</span>
          <button
            onClick={() => { setNoteFormOpen(v => !v); setNoteForm({ headline: '', body: '' }); }}
            className="btn-secondary text-xs flex items-center gap-1 py-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add note
          </button>
        </div>

        {noteFormOpen && (
          <div className="mb-4 p-3 rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 space-y-2">
            <input
              type="text"
              value={noteForm.headline}
              onChange={e => setNoteForm(f => ({ ...f, headline: e.target.value }))}
              placeholder="Headline"
              className="input w-full text-sm font-medium"
              autoFocus={noteFormOpen}
            />
            <textarea
              value={noteForm.body}
              onChange={e => setNoteForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Note text (optional)"
              rows={3}
              className="input w-full text-sm resize-y"
            />
            <div className="flex gap-2 justify-end">
              {noteFormOpen && (
                <button onClick={() => setNoteFormOpen(false)} className="btn-secondary text-xs py-1">Cancel</button>
              )}
              <button
                onClick={handleCreateNote}
                disabled={noteSaving || !noteForm.headline.trim()}
                className="btn-primary text-xs py-1 flex items-center gap-1"
              >
                {noteSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {notes.length === 0 && !noteFormOpen && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">No notes yet — click "Add note" to get started.</p>
          )}
          {notes.map(note => (
            <div key={note.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              {editingNote?.id === note.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editForm.headline}
                    onChange={e => setEditForm(f => ({ ...f, headline: e.target.value }))}
                    className="input w-full text-sm font-medium"
                    autoFocus
                  />
                  <textarea
                    value={editForm.body}
                    onChange={e => setEditForm(f => ({ ...f, body: e.target.value }))}
                    rows={3}
                    className="input w-full text-sm resize-y"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditingNote(null)} className="btn-secondary text-xs py-1">Cancel</button>
                    <button
                      onClick={handleUpdateNote}
                      disabled={noteSaving || !editForm.headline.trim()}
                      className="btn-primary text-xs py-1 flex items-center gap-1"
                    >
                      {noteSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{note.headline}</p>
                    {note.body && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">{note.body}</p>}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{new Date(note.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => { setEditingNote(note); setEditForm({ headline: note.headline, body: note.body }); }}
                      className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="Delete"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Status selector (inline, clean) */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 mb-6">
        <div className="flex items-center gap-2 px-2 border-b border-gray-200 dark:border-gray-700">
          {([
            { id: 'cover_letter', label: 'Cover Letter', icon: FileText },
            { id: 'job_description', label: 'Job Description', icon: FileText },
            { id: 'analysis', label: 'Analysis', icon: BarChart },
            { id: 'history', label: 'History', icon: History },
            ...(app.status === 'interview' || app.status === 'offer'
              ? [{ id: 'prep' as Tab, label: 'Interview', icon: BookOpen }]
              : []),
          ] as { id: Tab; label: string; icon: React.ElementType }[]).map(({ id: tabId, label, icon: Icon }) => (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === tabId
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {tabId === 'history' && logs.length > 0 && (
                <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs px-1.5 py-0.5 rounded-full">
                  {logs.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {app.status !== 'interview' && app.status !== 'offer' && (
          <p className="text-xs text-gray-400 dark:text-gray-500 px-4 py-2 border-b border-gray-100 dark:border-gray-700">
            Interview prep unlocks when status is set to <strong>Interview</strong> or <strong>Offer</strong>.
          </p>
        )}

        <div className="p-6">
          {/* Cover Letter Tab */}
          {tab === 'cover_letter' && (
            <div className="space-y-4">
              {logs.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-500 dark:text-gray-400">No cover letter generated yet</p>
                  <button onClick={() => navigate(`/apply?applicationId=${id}&step=${app?.fit_analysis ? 3 : 2}`)} className="btn-primary mt-3">Generate one</button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <label className="label mb-0">Version:</label>
                      <select
                        value={selectedVersion}
                        onChange={e => setSelectedVersion(e.target.value)}
                        className="input w-48"
                      >
                        {logs.map(log => (
                          <option key={log.id} value={log.id}>
                            v{log.version} — {new Date(log.created_at).toLocaleDateString()}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={handleRegenerateOdt}
                      disabled={regeneratingOdt}
                      className="btn-secondary flex items-center gap-2 text-sm"
                      title="Re-create ODT, PDF and copy attachments from the latest cover letter version"
                    >
                      {regeneratingOdt
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <RefreshCw className="w-4 h-4" />}
                      Recreate Output Files
                    </button>
                  </div>

                  {selectedLog && (
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                      <MarkdownPreview content={selectedLog.response} />
                    </div>
                  )}

                  {/* Refinement */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <Wand2 className="w-4 h-4 text-primary-500" />
                      Refine this letter
                    </h3>
                    <textarea
                      placeholder="Make it more concise, add more emphasis on leadership, change the opening hook..."
                      value={refineInstruction}
                      onChange={e => setRefineInstruction(e.target.value)}
                      rows={3}
                      className="input resize-y"
                    />

                    <button
                      onClick={handleRefine}
                      disabled={!refineInstruction.trim() || refineStream.loading}
                      className="btn-primary flex items-center gap-2"
                    >
                      {refineStream.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      Refine
                    </button>

                    {(refineStream.text || refineStream.loading) && (
                      <div className={`bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4 ${refineStream.done ? '' : 'max-h-96 overflow-y-auto'}`}>
                        {refineStream.done
                          ? <MarkdownPreview content={refineStream.text} />
                          : <StreamingText text={refineStream.text} done={refineStream.done} />
                        }
                      </div>
                    )}

                    {refineStream.error && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        {refineStream.error}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Job Description Tab */}
          {tab === 'job_description' && (() => {
            const md = app.job_description;
            const isMarkdown = /^#{1,6} /m.test(md) || /\*\*.+?\*\*/.test(md) || /^- .+/m.test(md) || /^[*•] .+/m.test(md);
            return isMarkdown
              ? <MarkdownPreview content={md} />
              : <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans leading-relaxed">{md}</pre>;
          })()}

          {/* Analysis Tab */}
          {tab === 'analysis' && (
            <div>
              {app.fit_analysis && !analyzeStream.loading && !analyzeStream.text ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-6">
                    {app.fit_score !== undefined && app.fit_score !== null && (
                      <FitScoreGauge score={app.fit_score} size={100} />
                    )}
                    <div className="flex-1">
                      <MarkdownPreview content={app.fit_analysis} />
                    </div>
                  </div>
                  {selectedCvId && (
                    <div className="flex justify-end border-t border-gray-200 dark:border-gray-700 pt-3">
                      <button
                        onClick={handleAnalyze}
                        disabled={analyzeStream.loading}
                        className="btn-secondary flex items-center gap-2 text-sm"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Recreate Fit Analysis
                      </button>
                    </div>
                  )}
                </div>
              ) : (analyzeStream.loading || analyzeStream.text) ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    {analyzeScore !== null && <FitScoreGauge score={analyzeScore} size={100} />}
                    <div className={`flex-1 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4 ${analyzeStream.done ? '' : 'max-h-96 overflow-y-auto'}`}>
                      {analyzeStream.done
                        ? <MarkdownPreview content={analyzeStream.text} />
                        : <StreamingText text={analyzeStream.text} done={analyzeStream.done} />
                      }
                    </div>
                  </div>
                  {analyzeStream.error && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {analyzeStream.error}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <BarChart className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-500 dark:text-gray-400">No analysis available</p>
                  {app.job_description && selectedCvId ? (
                    <div className="mt-4 space-y-3">
                      {cvDocuments.length > 1 && (
                        <select
                          value={selectedCvId}
                          onChange={e => setSelectedCvId(e.target.value)}
                          className="input w-64 mx-auto block"
                        >
                          {cvDocuments.map(doc => (
                            <option key={doc.id} value={doc.id}>{doc.label}</option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={handleAnalyze}
                        className="btn-primary flex items-center gap-2 mx-auto"
                      >
                        <Play className="w-4 h-4" />
                        Run Fit Analysis
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {!app.job_description ? 'Add a job description to run analysis' : 'No CV found in vault'}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {tab === 'history' && (
            <HistoryTab logs={logs} />
          )}

          {/* Prep Tab */}
          {tab === 'prep' && (
            <div className="space-y-6">
              {prepLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : prepGenerating ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                    Generating interview questions...
                  </div>
                  {prepStreamText && (
                    <pre className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 overflow-auto max-h-48 font-mono whitespace-pre-wrap">
                      {prepStreamText}
                    </pre>
                  )}
                </div>
              ) : prep ? (
                <div className="space-y-4">
                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={handleCopyPrep} className="btn-secondary flex items-center gap-2 text-sm">
                      <Copy className="w-4 h-4" /> Copy as Markdown
                    </button>
                    <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2 text-sm">
                      <Printer className="w-4 h-4" /> Print
                    </button>
                    {showRegenerateWarning ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-600 dark:text-amber-400">This will replace your current prep.</span>
                        <button onClick={handleGeneratePrep} className="btn-danger text-sm flex items-center gap-2">
                          <RefreshCw className="w-4 h-4" /> Confirm Regenerate
                        </button>
                        <button onClick={() => setShowRegenerateWarning(false)} className="btn-secondary text-sm">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setShowRegenerateWarning(true)} className="btn-secondary flex items-center gap-2 text-sm">
                        <RefreshCw className="w-4 h-4" /> Regenerate
                      </button>
                    )}
                  </div>

                  {/* Questions they'll ask you */}
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                      <BookOpen className="w-4 h-4 text-primary-500" />
                      Questions you'll likely be asked
                    </h3>
                    <div className="space-y-3">
                      {prep.questions.map((q, i) => (
                        <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                          <p className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                            <span className="text-primary-500 mr-2">Q{i + 1}.</span>{q.question}
                          </p>
                          <ul className="space-y-1">
                            {q.talking_points.map((tp, j) => (
                              <li key={j} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <span className="text-primary-400 mt-0.5 flex-shrink-0">•</span>
                                {tp}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Questions to ask the company */}
                  {prep.questions_to_ask?.length > 0 && (
                    <div>
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                        <MessageCircle className="w-4 h-4 text-primary-500" />
                        Questions to ask the interviewer
                      </h3>
                      <div className="space-y-3">
                        {prep.questions_to_ask.map((q, i) => (
                          <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                            <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                              <span className="text-primary-500 mr-2">{i + 1}.</span>{q.question}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">{q.purpose}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
                    <label className="label">My Notes</label>
                    <textarea
                      value={prepNotes}
                      onChange={e => setPrepNotes(e.target.value)}
                      onBlur={handleSavePrepNotes}
                      placeholder="Add notes for your interview session..."
                      rows={4}
                      className="input resize-y"
                    />
                    {prepNotesSaving && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                      </span>
                    )}
                    {prepNotesSaved && (
                      <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 space-y-3">
                  <BookOpen className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto" />
                  <p className="text-gray-500 dark:text-gray-400">No interview prep generated yet</p>
                  {prepError && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm mx-auto max-w-sm">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {prepError}
                    </div>
                  )}
                  <button onClick={handleGeneratePrep} className="btn-primary flex items-center gap-2 mx-auto">
                    <Play className="w-4 h-4" /> Generate Interview Questions
                  </button>
                </div>
              )}

              {prepError && prep && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {prepError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete application"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300 text-sm">
            Are you sure you want to delete <span className="font-semibold">{app?.company} — {app?.role}</span>? This cannot be undone.
          </p>

          {app?.output_path && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
              <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                <FolderOpen className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Output folder found</p>
                  <p className="text-xs mt-0.5 font-mono break-all opacity-80">{app.output_path}</p>
                </div>
              </div>
              <p className="text-sm text-amber-700 dark:text-amber-400">Do you also want to delete the output folder and all generated files inside it?</p>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => confirmDelete(true)}
                  disabled={deleting}
                  className="btn-primary flex items-center justify-center gap-2 w-full"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete application and folder
                </button>
                <button
                  onClick={() => confirmDelete(false)}
                  disabled={deleting}
                  className="btn-secondary flex items-center justify-center gap-2 w-full"
                >
                  Delete application only
                </button>
              </div>
            </div>
          )}

          {!app?.output_path && (
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowDeleteModal(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={() => confirmDelete(false)}
                disabled={deleting}
                className="btn-primary flex items-center gap-2"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          )}

          {app?.output_path && (
            <button onClick={() => setShowDeleteModal(false)} className="btn-secondary w-full">Cancel</button>
          )}
        </div>
      </Modal>
    </>
  );
}
