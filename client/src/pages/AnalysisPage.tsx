import React, { useState, useRef } from 'react';
import { useStream } from '@/hooks/useStream';
import { getVaultDocuments, getCVReviewsByDoc, deleteCVReview, streamRewriteCV, patchCVRewriteResult, saveGapAnalysis, getGapAnalysisHistory, deleteGapAnalysis, saveCareerGuidance, getCareerGuidanceHistory, deleteCareerGuidance, getRecentApplicationRoles } from '@/api';
import { VaultDocument, CVReview } from '@/types';
import { useTheme } from '@/contexts/ThemeContext';
import { Button, Input, Modal, Select, useToast } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import MarkdownPreview from '@/components/MarkdownPreview';
import { Copy, Trash2, History, Loader2, RefreshCw, Save, TrendingUp, Compass, FileText, X } from 'lucide-react';

const ROLE_PRESETS = ['CEO / MD', 'CxO', 'VP', 'Director', 'Head of', 'Manager / Team Lead', 'Senior IC'];
const DEPARTMENT_PRESETS = [
  'Human Resources',
  'IT Development',
  'IT Operations',
  'Information Security',
  'Data & Analytics',
  'Product',
  'Project Management',
  'Sales',
  'Marketing',
  'Finance',
  'Legal & Compliance',
  'Operations',
  'Customer Success',
  'Procurement',
];

type CvPageTab = 'cv' | 'gap' | 'guidance';
type RewriteResult = { rewrittenCV: string; finalReview: string; score: number | null; iterations: number };

const TABS: { id: CvPageTab; label: string; icon: React.ElementType }[] = [
  { id: 'cv', label: 'CV Analysis', icon: FileText },
  { id: 'gap', label: 'Gap Analysis', icon: TrendingUp },
  { id: 'guidance', label: 'Career Guidance', icon: Compass },
];

export default function AnalysisPage() {
  useDocumentTitle('Analysis');
  const { theme } = useTheme();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<CvPageTab>('cv');
  const [deleteTarget, setDeleteTarget] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [docs, setDocs] = useState<VaultDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [history, setHistory] = useState<CVReview[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const { text, loading, error, start, reset, setText } = useStream();

  // Gap analysis state
  const { text: gapText, loading: gapLoading, error: gapError, start: gapStart, reset: gapReset } = useStream();

  // Career guidance state
  const { text: guidanceText, loading: guidanceLoading, error: guidanceError, start: guidanceStart, reset: guidanceReset } = useStream();
  const [guidanceHistory, setGuidanceHistory] = React.useState<{ id: string; content: string; created_at: number }[]>([]);
  const [guidanceHistoryLoading, setGuidanceHistoryLoading] = React.useState(true);
  const [guidanceSaving, setGuidanceSaving] = React.useState(false);
  const [guidanceSaved, setGuidanceSaved] = React.useState(false);
  const [guidanceActiveContent, setGuidanceActiveContent] = React.useState<string | null>(null);
  const [guidanceCopied, setGuidanceCopied] = React.useState(false);

  async function fetchGuidanceHistory() {
    setGuidanceHistoryLoading(true);
    try {
      const data = await getCareerGuidanceHistory();
      setGuidanceHistory(data);
    } catch (e) {
      console.error('Failed to fetch career guidance history', e);
    } finally {
      setGuidanceHistoryLoading(false);
    }
  }

  async function handleSaveGuidance(content: string) {
    setGuidanceSaving(true);
    try {
      await saveCareerGuidance(content);
      setGuidanceSaved(true);
      fetchGuidanceHistory();
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to save', 'error');
    } finally {
      setGuidanceSaving(false);
    }
  }

  function handleDeleteGuidance(id: string) {
    setDeleteTarget({
      message: 'Delete this career guidance entry?',
      onConfirm: async () => {
        try {
          await deleteCareerGuidance(id);
          setGuidanceHistory(prev => prev.filter(g => g.id !== id));
          if (guidanceActiveContent !== null && guidanceHistory.find(g => g.id === id)?.content === guidanceActiveContent) {
            setGuidanceActiveContent(null);
          }
        } catch (e) {
          console.error('Failed to delete', e);
        }
      },
    });
  }

  function handleCopyGuidance(content: string) {
    navigator.clipboard.writeText(content);
    setGuidanceCopied(true);
    setTimeout(() => setGuidanceCopied(false), 2000);
  }

  const [gapHistory, setGapHistory] = React.useState<{ id: string; content: string; created_at: number }[]>([]);
  const [gapHistoryLoading, setGapHistoryLoading] = React.useState(true);
  const [gapSaving, setGapSaving] = React.useState(false);
  const [gapSaved, setGapSaved] = React.useState(false);
  const [gapActiveContent, setGapActiveContent] = React.useState<string | null>(null);
  const [gapCopied, setGapCopied] = React.useState(false);

  // Rewrite state
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [maxIterations, setMaxIterations] = useState(5);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewriteLog, setRewriteLog] = useState<string[]>([]);
  const [rewriteStatus, setRewriteStatus] = useState('');
  const [rewriteResult, setRewriteResult] = useState<RewriteResult | null>(null);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [rewriteTab, setRewriteTab] = useState<'cv' | 'review'>('cv');
  const rewriteAbortRef = useRef<AbortController | null>(null);

  // Target role selector state
  const [selectedTargetRoles, setSelectedTargetRoles] = useState<string[]>([]);
  const [selectedTargetDepartments, setSelectedTargetDepartments] = useState<string[]>([]);
  const [recentAppRoles, setRecentAppRoles] = useState<string[]>([]);
  const [customRoleInput, setCustomRoleInput] = useState('');
  const [customDepartmentInput, setCustomDepartmentInput] = useState('');

  function toggleRole(role: string) {
    setSelectedTargetRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  }
  function addCustomRole() {
    const r = customRoleInput.trim();
    if (!r) return;
    setSelectedTargetRoles(prev => prev.includes(r) ? prev : [...prev, r]);
    setCustomRoleInput('');
  }
  function toggleDepartment(department: string) {
    setSelectedTargetDepartments(prev => prev.includes(department) ? prev.filter(d => d !== department) : [...prev, department]);
  }
  function addCustomDepartment() {
    const d = customDepartmentInput.trim();
    if (!d) return;
    setSelectedTargetDepartments(prev => prev.includes(d) ? prev : [...prev, d]);
    setCustomDepartmentInput('');
  }

  async function fetchDocs() {
    try {
      const cvDocs = await getVaultDocuments('cv');
      setDocs(cvDocs);
      const defaultCv = cvDocs.find((d: VaultDocument) => d.is_default === 1);
      if (defaultCv) setSelectedDocId(defaultCv.id);
    } catch (e) {
      console.error('Failed to fetch docs', e);
    } finally {
      setIsLoadingDocs(false);
    }
  }

  async function fetchHistory(docId: string): Promise<CVReview[]> {
    setIsLoadingHistory(true);
    try {
      const reviews = await getCVReviewsByDoc(docId);
      setHistory(reviews);
      return reviews;
    } catch (e) {
      console.error('Failed to fetch history', e);
      return [];
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function fetchGapHistory() {
    setGapHistoryLoading(true);
    try {
      const data = await getGapAnalysisHistory();
      setGapHistory(data);
    } catch (e) {
      console.error('Failed to fetch gap analysis history', e);
    } finally {
      setGapHistoryLoading(false);
    }
  }

  React.useEffect(() => {
    queueMicrotask(() => {
      void fetchDocs();
      void fetchGapHistory();
      void fetchGuidanceHistory();
      getRecentApplicationRoles().then(setRecentAppRoles).catch(() => {});
    });
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => {
      if (selectedDocId) void fetchHistory(selectedDocId);
      else setHistory([]);
    });
  }, [selectedDocId]);

  async function handleGapAnalysis() {
    gapReset();
    setGapSaved(false);
    setGapActiveContent(null);
    await gapStart('/gap-analysis', {});
  }

  async function handleSaveGap(content: string) {
    setGapSaving(true);
    try {
      await saveGapAnalysis(content);
      setGapSaved(true);
      fetchGapHistory();
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to save', 'error');
    } finally {
      setGapSaving(false);
    }
  }

  function handleDeleteGap(id: string) {
    setDeleteTarget({
      message: 'Delete this gap analysis?',
      onConfirm: async () => {
        try {
          await deleteGapAnalysis(id);
          setGapHistory(prev => prev.filter(g => g.id !== id));
          if (gapActiveContent !== null && gapHistory.find(g => g.id === id)?.content === gapActiveContent) {
            setGapActiveContent(null);
          }
        } catch (e) {
          console.error('Failed to delete', e);
        }
      },
    });
  }

  function handleCopyGap(content: string) {
    navigator.clipboard.writeText(content);
    setGapCopied(true);
    setTimeout(() => setGapCopied(false), 2000);
  }

  async function handleReview() {
    if (!selectedDocId) return;
    resetRewrite();
    reset();
    setActiveAnalysisId(null);
    await start('/analyze-cv', { cvDocumentId: selectedDocId, targetRoles: selectedTargetRoles, targetDepartments: selectedTargetDepartments });
    const reviews = await fetchHistory(selectedDocId);
    setActiveAnalysisId(reviews[0]?.id ?? null);
  }

  function handleDeleteReview(id: string) {
    setDeleteTarget({
      message: 'Delete this review?',
      onConfirm: async () => {
        try {
          await deleteCVReview(id);
          setHistory(prev => prev.filter(r => r.id !== id));
        } catch (e) {
          console.error('Failed to delete review', e);
        }
      },
    });
  }

  function resetRewrite() {
    rewriteAbortRef.current?.abort();
    setRewriteLoading(false);
    setRewriteLog([]);
    setRewriteStatus('');
    setRewriteResult(null);
    setRewriteError(null);
    setRewriteTab('cv');
  }

  async function handleRewrite() {
    if (!selectedDocId || !text) return;
    resetRewrite();
    setRewriteLoading(true);

    const abort = new AbortController();
    rewriteAbortRef.current = abort;

    try {
      const res = await streamRewriteCV(selectedDocId, text, maxIterations, selectedTargetRoles, selectedTargetDepartments, abort.signal);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'phase') {
              if (event.phase === 'rewriting') setRewriteStatus('Rewriting CV…');
              else if (event.phase === 'reviewing') setRewriteStatus('Reviewing rewritten CV…');
            } else if (event.type === 'iteration_done') {
              const s = event.score;
              const logLine = s != null
                ? s >= 9
                  ? `Rewrote CV — score ${s}/10, target reached!`
                  : `Rewrote CV — score ${s}/10, trying again…`
                : 'Rewrote CV — no score detected, trying again…';
              setRewriteLog(prev => [...prev, logLine]);
              setRewriteStatus('');
            } else if (event.type === 'done') {
              setRewriteStatus('');
              const result: RewriteResult = { rewrittenCV: event.rewrittenCV, finalReview: event.finalReview, score: event.score, iterations: event.iterations };
              setRewriteResult(result);
              setRewriteLoading(false);
              if (activeAnalysisId) {
                patchCVRewriteResult(activeAnalysisId, {
                  rewrittenCV: event.rewrittenCV,
                  rewriteReview: event.finalReview,
                  rewriteScore: event.score ?? null,
                }).catch(e => console.error('Failed to save rewrite to analysis', e));
              }
            } else if (event.type === 'error') {
              setRewriteStatus('');
              setRewriteError(event.error);
              setRewriteLoading(false);
            }
          } catch {
            // ignore malformed
          }
        }
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        setRewriteError(e instanceof Error ? e.message : 'Rewrite failed');
      }
    } finally {
      setRewriteLoading(false);
    }
  }

  const scoreMatch = text?.match(/SCORE:\s*(\d+(\.\d+)?)/i);
  const score = scoreMatch ? scoreMatch[1] : null;
  const reviewDone = !!text && !loading;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: theme.text }}>Analysis</h1>
        <p style={{ color: theme.text2 }}>Evaluate your CV, identify gaps, and discover roles where you'll shine.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1.5 rounded-xl" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex flex-col items-center gap-1.5 flex-1 justify-center py-3 rounded-lg text-sm font-medium transition-colors"
            style={activeTab === id
              ? { background: theme.accent, color: '#fff' }
              : { color: theme.text2, background: 'transparent' }
            }
          >
            <Icon className="w-6 h-6" />
            {label}
          </button>
        ))}
      </div>

      {/* ── CV Analysis ─────────────────────────────────────────────────── */}
      {activeTab === 'cv' && (
        <div className="p-6 rounded-xl border border-white/10 space-y-4" style={{ background: theme.surface }}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold" style={{ color: theme.text }}>CV Analysis</h2>
              </div>
              <p className="text-sm" style={{ color: theme.text2 }}>
                Get a direct, practical CV review with prioritized improvements for your target roles.
              </p>
            </div>
            <Button variant="primary"
              className="shrink-0 flex items-center gap-1.5 text-sm py-2 px-4"
              onClick={handleReview}
              disabled={!selectedDocId || loading}
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</> : 'Analyze CV'}
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1" style={{ color: theme.text }}>Select CV</label>
            <Select
              className="w-full"
              style={{ background: theme.surface2, color: theme.text, borderColor: theme.border }}
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
            >
              <option value="" style={{ background: theme.surface, color: theme.text }}>Choose a document...</option>
              {isLoadingDocs ? (
                <option style={{ background: theme.surface, color: theme.text }}>Loading documents...</option>
              ) : (
                docs.map(doc => (
                  <option key={doc.id} value={doc.id} style={{ background: theme.surface, color: theme.text }}>{doc.label}</option>
                ))
              )}
            </Select>
          </div>

          {/* Target role selector */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1 mb-0" style={{ color: theme.text }}>Target roles</label>
              {selectedTargetRoles.length > 0 && (
                <button onClick={() => setSelectedTargetRoles([])} className="text-xs" style={{ color: theme.text2 }}>Clear all</button>
              )}
            </div>

            {/* Preset seniority chips */}
            <div className="flex flex-wrap gap-1.5">
              {ROLE_PRESETS.map(role => {
                const active = selectedTargetRoles.includes(role);
                return (
                  <button
                    key={role}
                    onClick={() => toggleRole(role)}
                    className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
                    style={active
                      ? { background: theme.accent, color: '#fff', border: `1px solid ${theme.accent}` }
                      : { background: theme.surface2, color: theme.text2, border: `1px solid ${theme.border}` }
                    }
                  >
                    {role}
                  </button>
                );
              })}
            </div>

            {/* Application roles */}
            {recentAppRoles.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs" style={{ color: theme.text2 }}>From your applications:</p>
                <div className="flex flex-wrap gap-1.5">
                  {recentAppRoles.map(role => {
                    const active = selectedTargetRoles.includes(role);
                    return (
                      <button
                        key={role}
                        onClick={() => toggleRole(role)}
                        className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
                        style={active
                          ? { background: theme.accent, color: '#fff', border: `1px solid ${theme.accent}` }
                          : { background: theme.surface2, color: theme.text2, border: `1px solid ${theme.border}` }
                        }
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Custom roles (added by user) */}
            {selectedTargetRoles.filter(r => !ROLE_PRESETS.includes(r) && !recentAppRoles.includes(r)).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedTargetRoles.filter(r => !ROLE_PRESETS.includes(r) && !recentAppRoles.includes(r)).map(role => (
                  <span
                    key={role}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-medium"
                    style={{ background: theme.accent, color: '#fff', border: `1px solid ${theme.accent}` }}
                  >
                    {role}
                    <button onClick={() => toggleRole(role)} className="opacity-70 hover:opacity-100 ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Custom input */}
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Add custom role…"
                value={customRoleInput}
                onChange={e => setCustomRoleInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCustomRole(); }}
                className="text-xs flex-1"
                style={{ background: theme.surface2, color: theme.text, borderColor: theme.border, padding: '6px 10px' }} />
              <Button
                onClick={addCustomRole}
                disabled={!customRoleInput.trim()}
                className="text-xs px-3"
              >
                Add
              </Button>
            </div>
          </div>

          {/* Target department selector */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1 mb-0" style={{ color: theme.text }}>Target departments</label>
              {selectedTargetDepartments.length > 0 && (
                <button onClick={() => setSelectedTargetDepartments([])} className="text-xs" style={{ color: theme.text2 }}>Clear all</button>
              )}
            </div>
            <p className="text-xs" style={{ color: theme.text2 }}>
              Select the business areas the CV should speak to. This helps the review emphasize the right evidence and language.
            </p>

            <div className="flex flex-wrap gap-1.5">
              {DEPARTMENT_PRESETS.map(department => {
                const active = selectedTargetDepartments.includes(department);
                return (
                  <button
                    key={department}
                    onClick={() => toggleDepartment(department)}
                    className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
                    style={active
                      ? { background: theme.accent, color: '#fff', border: `1px solid ${theme.accent}` }
                      : { background: theme.surface2, color: theme.text2, border: `1px solid ${theme.border}` }
                    }
                  >
                    {department}
                  </button>
                );
              })}
            </div>

            {selectedTargetDepartments.filter(d => !DEPARTMENT_PRESETS.includes(d)).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedTargetDepartments.filter(d => !DEPARTMENT_PRESETS.includes(d)).map(department => (
                  <span
                    key={department}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-medium"
                    style={{ background: theme.accent, color: '#fff', border: `1px solid ${theme.accent}` }}
                  >
                    {department}
                    <button onClick={() => toggleDepartment(department)} className="opacity-70 hover:opacity-100 ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Add custom department..."
                value={customDepartmentInput}
                onChange={e => setCustomDepartmentInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCustomDepartment(); }}
                className="text-xs flex-1"
                style={{ background: theme.surface2, color: theme.text, borderColor: theme.border, padding: '6px 10px' }} />
              <Button
                onClick={addCustomDepartment}
                disabled={!customDepartmentInput.trim()}
                className="text-xs px-3"
              >
                Add
              </Button>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-500/20 border border-red-500/50 text-red-200 rounded-lg">{error}</div>
          )}

          {(text || loading) && (
            <div className="space-y-6">
              {score && (
                <div className="flex items-center justify-center p-8 bg-gradient-to-br from-accent to-pink-500 rounded-2xl shadow-lg">
                  <div className="text-center">
                    <div className="text-sm uppercase tracking-widest text-white/80 font-semibold">CV Score</div>
                    <div className="text-7xl font-black text-white">{score}<span className="text-2xl opacity-60">/10</span></div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold" style={{ color: theme.text }}>Analysis</h3>
                <div className="flex items-center gap-2">
                  {text && (
                    <Button
                      onClick={() => { navigator.clipboard.writeText(text); addToast('Copied to clipboard', 'success'); }}
                      className="flex items-center gap-1.5 text-xs py-1 px-2.5">
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </Button>
                  )}
                  {reviewDone && !rewriteLoading && !rewriteResult && (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: theme.text2 }}>Passes:</span>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={maxIterations}
                          onChange={e => setMaxIterations(Number(e.target.value))}
                          className="w-20 accent-accent"
                        />
                        <span className="text-xs font-semibold w-3 text-center" style={{ color: theme.text }}>{maxIterations}</span>
                      </div>
                      <Button variant="primary"
                        onClick={handleRewrite}
                        className="flex items-center gap-1.5 text-xs py-1 px-2.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Rewrite CV
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 rounded-xl border border-white/10 prose max-w-none" style={{ background: theme.surface2, color: theme.text }}>
                <div>
                  {text ? <MarkdownPreview content={text} /> : (
                    loading && <span className="inline-block w-2 h-5 ml-1 bg-accent animate-pulse" />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Rewrite progress + result */}
          {(rewriteLoading || rewriteResult || rewriteError || rewriteLog.length > 0) && (
            <div className="p-6 rounded-xl border border-white/10 space-y-5" style={{ background: theme.surface2 }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className={`w-5 h-5 text-accent ${rewriteLoading ? 'animate-spin' : ''}`} />
                  <h3 className="text-base font-semibold" style={{ color: theme.text }}>
                    CV rewrite
                  </h3>
                </div>
                {rewriteResult && (
                  <Button onClick={resetRewrite} className="text-xs py-1 px-2.5">Reset</Button>
                )}
              </div>

              {(rewriteLog.length > 0 || rewriteStatus) && (
                <div className="space-y-1.5">
                  {rewriteLog.map((line, i) => (
                    <p key={i} className="text-sm" style={{ color: theme.text2 }}>{line}</p>
                  ))}
                  {rewriteStatus && (
                    <div className="flex items-center gap-2 text-sm">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-accent shrink-0" />
                      <span style={{ color: theme.text2 }}>{rewriteStatus}</span>
                    </div>
                  )}
                </div>
              )}

              {rewriteError && (
                <div className="p-3 bg-red-500/20 border border-red-500/50 text-red-200 rounded-lg text-sm">{rewriteError}</div>
              )}

              {rewriteResult && (
                <div className="space-y-4">
                  <div className="flex items-center justify-center p-6 bg-gradient-to-br from-accent to-pink-500 rounded-xl shadow-lg">
                    <div className="text-center">
                      <div className="text-xs uppercase tracking-widest text-white/80 font-semibold mb-1">
                        Final Score after {rewriteResult.iterations} iteration{rewriteResult.iterations !== 1 ? 's' : ''}
                      </div>
                      <div className="text-6xl font-black text-white">
                        {rewriteResult.score ?? '?'}<span className="text-xl opacity-60">/10</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1 p-1 rounded-lg" style={{ background: theme.surface }}>
                    {(['cv', 'review'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setRewriteTab(tab)}
                        className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${rewriteTab === tab ? 'bg-accent text-white' : ''}`}
                        style={rewriteTab !== tab ? { color: theme.text2 } : {}}
                      >
                        {tab === 'cv' ? 'Rewritten CV' : 'Final Review'}
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      onClick={() => navigator.clipboard.writeText(rewriteTab === 'cv' ? rewriteResult.rewrittenCV : rewriteResult.finalReview).then(() => addToast('Copied to clipboard', 'success'))}
                      className="flex items-center gap-1.5 text-xs py-1 px-2.5">
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </Button>
                  </div>

                  <div className="p-6 rounded-xl border border-white/10" style={{ background: theme.surface, color: theme.text }}>
                    <MarkdownPreview content={rewriteTab === 'cv' ? rewriteResult.rewrittenCV : rewriteResult.finalReview} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Analysis History */}
          {history.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-white/10">
              <div className="flex items-center gap-2 pb-1">
                <History className="w-4 h-4" style={{ color: theme.text2 }} />
                <span className="text-sm font-medium" style={{ color: theme.text2 }}>Analysis History</span>
              </div>

              {isLoadingHistory ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: theme.accent }} />
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map(review => {
                    const sm = review.content?.match(/SCORE:\s*(\d+(\.\d+)?)/i);
                    const displayScore = review.score ?? (sm ? sm[1] : null);
                    return (
                      <div
                        key={review.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-white/10 hover:border-accent/50 transition-colors"
                        style={{ background: theme.surface2 }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm" style={{ color: theme.text }}>
                            {new Date(review.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {displayScore != null && (
                            <span className="text-sm font-semibold text-accent">{displayScore}/10</span>
                          )}
                          {review.rewritten_cv && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-accent/20 text-accent">rewritten</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => {
                              resetRewrite();
                              reset();
                              setText(review.content);
                              setActiveAnalysisId(review.id);
                              if (review.rewritten_cv) {
                                setRewriteResult({
                                  rewrittenCV: review.rewritten_cv,
                                  finalReview: review.rewrite_review ?? '',
                                  score: review.rewrite_score,
                                  iterations: 0,
                                });
                              }
                            }}
                            className="text-xs py-1 px-3">
                            View
                          </Button>
                          <button
                            onClick={() => handleDeleteReview(review.id)}
                            className="p-2 rounded-lg text-gray-500 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Gap Analysis ─────────────────────────────────────────────────── */}
      {activeTab === 'gap' && (
        <div className="p-6 rounded-xl border border-white/10 space-y-4" style={{ background: theme.surface }}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold" style={{ color: theme.text }}>Gap analysis</h2>
              </div>
              <p className="text-sm" style={{ color: theme.text2 }}>
                Synthesises your latest fit analyses (up to 10) into a summary of recurring gaps and concrete CV changes.
              </p>
            </div>
            <Button variant="primary"
              className="shrink-0 flex items-center gap-1.5 text-sm py-2 px-4"
              onClick={handleGapAnalysis}
              disabled={gapLoading}
            >
              {gapLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</> : 'Run Gap Analysis'}
            </Button>
          </div>

          {gapError && (
            <div className="p-4 bg-red-500/20 border border-red-500/50 text-red-200 rounded-lg text-sm">{gapError}</div>
          )}

          {/* Streaming / active result */}
          {(gapText || gapLoading) && !gapActiveContent && (
            <div className="space-y-3">
              <div className="flex justify-end gap-2">
                {gapText && !gapLoading && (
                  <>
                    <Button
                      onClick={() => handleCopyGap(gapText)}
                      className="flex items-center gap-1.5 text-xs py-1 px-2.5">
                      <Copy className="w-3.5 h-3.5" />{gapCopied ? 'Copied!' : 'Copy'}
                    </Button>
                    <Button
                      disabled={gapSaving || gapSaved}
                      onClick={() => handleSaveGap(gapText)}
                      className="flex items-center gap-1.5 text-xs py-1 px-2.5">
                      {gapSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {gapSaved ? 'Saved' : 'Save'}
                    </Button>
                  </>
                )}
              </div>
              <div className="p-6 rounded-xl border border-white/10 prose max-w-none" style={{ background: theme.surface2, color: theme.text }}>
                {gapText
                  ? <MarkdownPreview content={gapText} />
                  : <span className="inline-block w-2 h-5 ml-1 bg-accent animate-pulse" />}
              </div>
            </div>
          )}

          {/* Opened from history */}
          {gapActiveContent && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Button onClick={() => setGapActiveContent(null)} className="text-xs py-1 px-2.5">← Back</Button>
                <Button
                  onClick={() => handleCopyGap(gapActiveContent)}
                  className="flex items-center gap-1.5 text-xs py-1 px-2.5">
                  <Copy className="w-3.5 h-3.5" />{gapCopied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <div className="p-6 rounded-xl border border-white/10 prose max-w-none" style={{ background: theme.surface2, color: theme.text }}>
                <MarkdownPreview content={gapActiveContent} />
              </div>
            </div>
          )}

          {/* History */}
          {!gapHistoryLoading && gapHistory.length > 0 && !gapActiveContent && (
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex items-center gap-2 pb-1">
                <History className="w-4 h-4" style={{ color: theme.text2 }} />
                <span className="text-sm font-medium" style={{ color: theme.text2 }}>Saved analyses</span>
              </div>
              {gapHistory.map(g => (
                <div
                  key={g.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-white/10 hover:border-accent/50 transition-colors"
                  style={{ background: theme.surface2 }}
                >
                  <span className="text-sm" style={{ color: theme.text }}>
                    {new Date(g.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => { gapReset(); setGapActiveContent(g.content); }}
                      className="text-xs py-1 px-3">
                      View
                    </Button>
                    <button
                      onClick={() => handleDeleteGap(g.id)}
                      className="p-2 rounded-lg text-gray-500 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!gapHistoryLoading && gapHistory.length === 0 && !gapText && !gapLoading && (
            <div className="text-center py-8">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: theme.text2 }} />
              <p className="text-sm" style={{ color: theme.text2 }}>No gap analyses saved yet.</p>
              <p className="text-xs mt-1" style={{ color: theme.text2 }}>Run a gap analysis to identify patterns across your fit scores.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Career Guidance ──────────────────────────────────────────────── */}
      {activeTab === 'guidance' && (
        <div className="p-6 rounded-xl border border-white/10 space-y-4" style={{ background: theme.surface }}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold" style={{ color: theme.text }}>Career guidance</h2>
              </div>
              <p className="text-sm" style={{ color: theme.text2 }}>
                Based on your default CV, discover the roles and job titles where you'd score 90+ — your strengths, your best matches.
              </p>
            </div>
            <Button variant="primary"
              className="shrink-0 flex items-center gap-1.5 text-sm py-2 px-4"
              onClick={() => { guidanceReset(); guidanceStart('/career-guidance', {}); }}
              disabled={guidanceLoading}
            >
              {guidanceLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : 'Generate Guidance'}
            </Button>
          </div>

          {guidanceError && (
            <div className="p-4 bg-red-500/20 border border-red-500/50 text-red-200 rounded-lg text-sm">{guidanceError}</div>
          )}

          {/* Streaming / active result */}
          {(guidanceText || guidanceLoading) && !guidanceActiveContent && (
            <div className="space-y-3">
              <div className="flex justify-end gap-2">
                {guidanceText && !guidanceLoading && (
                  <>
                    <Button
                      onClick={() => handleCopyGuidance(guidanceText)}
                      className="flex items-center gap-1.5 text-xs py-1 px-2.5">
                      <Copy className="w-3.5 h-3.5" />{guidanceCopied ? 'Copied!' : 'Copy'}
                    </Button>
                    <Button
                      disabled={guidanceSaving || guidanceSaved}
                      onClick={() => handleSaveGuidance(guidanceText)}
                      className="flex items-center gap-1.5 text-xs py-1 px-2.5">
                      {guidanceSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {guidanceSaved ? 'Saved' : 'Save'}
                    </Button>
                  </>
                )}
              </div>
              <div className="p-6 rounded-xl border border-white/10 prose max-w-none" style={{ background: theme.surface2, color: theme.text }}>
                {guidanceText
                  ? <MarkdownPreview content={guidanceText} />
                  : <span className="inline-block w-2 h-5 ml-1 bg-accent animate-pulse" />}
              </div>
            </div>
          )}

          {/* Opened from history */}
          {guidanceActiveContent && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Button onClick={() => setGuidanceActiveContent(null)} className="text-xs py-1 px-2.5">← Back</Button>
                <Button
                  onClick={() => handleCopyGuidance(guidanceActiveContent)}
                  className="flex items-center gap-1.5 text-xs py-1 px-2.5">
                  <Copy className="w-3.5 h-3.5" />{guidanceCopied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <div className="p-6 rounded-xl border border-white/10 prose max-w-none" style={{ background: theme.surface2, color: theme.text }}>
                <MarkdownPreview content={guidanceActiveContent} />
              </div>
            </div>
          )}

          {/* History */}
          {!guidanceHistoryLoading && guidanceHistory.length > 0 && !guidanceActiveContent && (
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex items-center gap-2 pb-1">
                <History className="w-4 h-4" style={{ color: theme.text2 }} />
                <span className="text-sm font-medium" style={{ color: theme.text2 }}>Saved guidance</span>
              </div>
              {guidanceHistory.map(g => (
                <div
                  key={g.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-white/10 hover:border-accent/50 transition-colors"
                  style={{ background: theme.surface2 }}
                >
                  <span className="text-sm" style={{ color: theme.text }}>
                    {new Date(g.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => { guidanceReset(); setGuidanceActiveContent(g.content); }}
                      className="text-xs py-1 px-3">
                      View
                    </Button>
                    <button
                      onClick={() => handleDeleteGuidance(g.id)}
                      className="p-2 rounded-lg text-gray-500 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!guidanceHistoryLoading && guidanceHistory.length === 0 && !guidanceText && !guidanceLoading && (
            <div className="text-center py-8">
              <Compass className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: theme.text2 }} />
              <p className="text-sm" style={{ color: theme.text2 }}>No career guidance saved yet.</p>
              <p className="text-xs mt-1" style={{ color: theme.text2 }}>Generate guidance to discover the roles best matched to your CV.</p>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Confirm deletion"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">{deleteTarget?.message} This cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger"
              onClick={() => { deleteTarget?.onConfirm(); setDeleteTarget(null); }}
              className="flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
