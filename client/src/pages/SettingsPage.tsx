import { useState, useEffect } from 'react';
import {
  Cpu, Palette, FolderOpen,
  Eye, EyeOff, Loader2, CheckCircle, AlertCircle, TestTube,
  BookText, Plus, Trash2, Edit2, X, Save, Upload,
  Download, FileJson, Table, Star, FileText, Info,
  ArrowRight, Sparkles, User, Layers, BarChart2, Terminal,
  Lock, Unlock, AlertTriangle, RotateCcw
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSettings, updateSettings, getApiKeyStatus,
         getVaultDocuments, uploadDocument, updateDocument, deleteDocument, getVaultDocumentText,
         getSnippets, createSnippet, updateSnippet, deleteSnippet,
         exportCSV, exportConfig, importConfig,
         exportFullBackup, importFullBackup,
         getBestPractices, updateBestPractices, getLocalModels, getPrompts,
         updatePrompt, resetPrompt } from '@/api';
import type { Settings as SettingsType, VaultDocument, Snippet, PromptsResponse } from '@/types';
import { useTheme } from '@/contexts/ThemeContext';
import ThemePicker from '@/components/ThemePicker';
import { Button, ConfirmDialog, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import FileDropzone from '@/components/FileDropzone';
import FileBrowser from '@/components/FileBrowser';
import MarkdownPreview from '@/components/MarkdownPreview';

type Tab = 'setup' | 'ai' | 'prompt' | 'output' | 'themes' | 'vault' | 'snippets' | 'data';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'setup', label: 'Setup', icon: CheckCircle },
  { id: 'ai', label: 'AI', icon: Cpu },
  { id: 'vault', label: 'Documents', icon: FileText },
  { id: 'output', label: 'Output', icon: FolderOpen },
  { id: 'prompt', label: 'Writing', icon: Edit2 },
  { id: 'themes', label: 'Appearance', icon: Palette },
  { id: 'data', label: 'Data', icon: Download },
];

const SETTINGS_TAB_IDS = new Set<Tab>(['setup', 'ai', 'prompt', 'output', 'themes', 'vault', 'snippets', 'data']);

function normalizeTab(value: string | null): Tab {
  if (value === 'snippets') return 'prompt';
  if (value && SETTINGS_TAB_IDS.has(value as Tab)) return value as Tab;
  return 'setup';
}

// ── Vault helpers ─────────────────────────────────────────────────────────────

const DOC_TYPES = ['cv', 'cover_letter', 'portfolio', 'other', 'cover_letter_template', 'attachment'] as const;
type DocType = typeof DOC_TYPES[number];
const TYPE_LABELS: Record<DocType, string> = { cv: 'CV / Resume', cover_letter: 'Cover Letter', portfolio: 'Portfolio', other: 'Other', cover_letter_template: 'Cover Letter Template', attachment: 'Attachment' };
const TYPE_COLORS: Record<DocType, string> = {
  cv: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  cover_letter: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  portfolio: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  other: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  cover_letter_template: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  attachment: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
};
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PROMPT_META: Record<string, { title: string; icon: React.ElementType }> = {
  fitAnalysis:    { title: 'Fit Analysis',            icon: BarChart2  },
  analyzeCv:      { title: 'Analyse CV',              icon: User       },
  refinement:     { title: 'Cover Letter Refinement', icon: Edit2      },
  careerGuidance: { title: 'Career Guidance',         icon: BookText   },
  interviewPrep:  { title: 'Interview Prep',          icon: Terminal   },
  gapAnalysis:    { title: 'Gap Analysis',            icon: Layers     },
  rewriteCV:      { title: 'Rewrite CV',              icon: RotateCcw  },
};

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: {
  title: string; subtitle: string; children: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <div style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: '16px',
      padding: '24px',
      marginBottom: '20px',
      boxShadow: 'var(--theme-shadow)',
    }}>
      <h2 className="text-base font-bold mb-1" style={{ color: theme.text }}>{title}</h2>
      <p className="text-xs mb-5" style={{ color: theme.text2 }}>{subtitle}</p>
      {children}
    </div>
  );
}

// ── Segmented button ──────────────────────────────────────────────────────────

function SegmentedButton<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const { theme } = useTheme();
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1,
            minWidth: '80px',
            padding: '8px 12px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s',
            background: value === opt.value ? `${theme.accent}15` : theme.surface2,
            border: `1px solid ${value === opt.value ? theme.accent : theme.border}`,
            color: value === opt.value ? theme.accent : theme.text2,
            boxShadow: value === opt.value ? `0 0 0 3px ${theme.accent}15` : 'none',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const REQUIRED_STEPS = [
  {
    key: 'ai',
    label: 'Configure AI',
    description: 'Set your API key or local model connection to enable cover letter generation.',
    action: 'Configure AI',
    tab: 'ai' as Tab,
  },
  {
    key: 'cv',
    label: 'Upload your CV',
    description: 'Add a CV / Resume document to your document library.',
    action: 'Upload CV',
    tab: 'vault' as Tab,
  },
];

const RECOMMENDED_STEPS = [
  {
    key: 'template',
    label: 'Add a cover letter template',
    description: 'Upload a template so generated letters match your preferred structure and tone.',
    action: 'Go to Documents',
    tab: 'vault' as Tab,
  },
  {
    key: 'output',
    label: 'Set output directory',
    description: 'Choose where generated cover letters are saved. Uses a default folder if not set.',
    action: 'Set folder',
    tab: 'output' as Tab,
  },
];

function StepList({ steps, done, details, onSelectTab }: {
  steps: { key: string; label: string; description: string; action: string; tab: Tab }[];
  done: boolean[];
  details: string[];
  onSelectTab: (tab: Tab) => void;
}) {
  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-700 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {steps.map((step, i) => {
        const isDone = done[i];
        return (
          <li key={step.key} className="flex items-center gap-4 px-4 py-3.5">
            {isDone
              ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              : <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${isDone ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                {step.label}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {isDone ? details[i] : step.description}
              </p>
            </div>
            {!isDone && (
              <button
                type="button"
                onClick={() => onSelectTab(step.tab)}
                className="text-xs font-medium text-accent dark:text-accent hover:underline flex items-center gap-1 flex-shrink-0"
              >
                {step.action} <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SetupStatus({ aiDone, cvDone, templateDone, outputDone, aiDetail, cvDetail, templateDetail, outputDetail, checkingDocuments, onSelectTab }: {
  aiDone: boolean;
  cvDone: boolean;
  templateDone: boolean;
  outputDone: boolean;
  aiDetail: string;
  cvDetail: string;
  templateDetail: string;
  outputDetail: string;
  checkingDocuments: boolean;
  onSelectTab: (tab: Tab) => void;
}) {
  const { theme } = useTheme();
  const requiredDone = [aiDone, cvDone];
  const requiredDetails = [aiDetail, cvDetail];
  const completedCount = requiredDone.filter(Boolean).length;
  const total = REQUIRED_STEPS.length;

  const recommendedDone = [templateDone, outputDone];
  const recommendedDetails = [templateDetail, outputDetail];

  return (
    <div className="space-y-6">
      <Section title="Required setup" subtitle="Complete both steps to enable analysis and cover-letter generation.">
        <div className="mb-4 flex items-center justify-between rounded-xl px-4 py-3" style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: theme.text }}>
              {completedCount === total ? 'Ready to generate' : 'Setup in progress'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: theme.text2 }}>
              {checkingDocuments ? 'Checking documents...' : `${completedCount}/${total} complete`}
            </p>
          </div>
          <div className="h-2 w-24 rounded-full overflow-hidden" style={{ background: theme.border }}>
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${(completedCount / total) * 100}%` }}
            />
          </div>
        </div>
        <StepList steps={REQUIRED_STEPS} done={requiredDone} details={requiredDetails} onSelectTab={onSelectTab} />
      </Section>

      <Section title="Recommended" subtitle="Not required, but these will improve your results.">
        <StepList steps={RECOMMENDED_STEPS} done={recommendedDone} details={recommendedDetails} onSelectTab={onSelectTab} />
      </Section>
    </div>
  );
}

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const location = useLocation();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { addToast } = useToast();

  // Determine initial tab from query param
  const queryTab = normalizeTab(new URLSearchParams(location.search).get('tab'));
  const [tab, setTab] = useState<Tab>(queryTab);

  useEffect(() => {
    setTab(normalizeTab(new URLSearchParams(location.search).get('tab')));
  }, [location.search]);

  const selectTab = (nextTab: Tab) => {
    setTab(nextTab);
    navigate(nextTab === 'setup' ? '/settings' : `/settings?tab=${nextTab}`, { replace: true });
  };

  // ── Settings state ────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<Partial<SettingsType>>({});
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<'ok' | 'fail' | null>(null);

  // ── Ollama state ──────────────────────────────────────────────────────────
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaDetecting, setOllamaDetecting] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [ollamaDetected, setOllamaDetected] = useState(false);

  // ── Vault state ───────────────────────────────────────────────────────────
  const [docTypesOpen, setDocTypesOpen] = useState(false);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultTab, setVaultTab] = useState<DocType | 'all'>('all');
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [newDocType, setNewDocType] = useState<DocType>('cv');
  const [previewDoc, setPreviewDoc] = useState<VaultDocument | null>(null);
  const [previewText, setPreviewText] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteDocTarget, setDeleteDocTarget] = useState<VaultDocument | null>(null);

  // ── Snippets state ────────────────────────────────────────────────────────
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [snippetsLoading, setSnippetsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editDefault, setEditDefault] = useState(false);
  const [snippetSaving, setSnippetSaving] = useState(false);
  const [showSnippetForm, setShowSnippetForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newDefault, setNewDefault] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteSnippetTarget, setDeleteSnippetTarget] = useState<string | null>(null);

  // ── Prompts state ─────────────────────────────────────────────────────────
  const [prompts, setPrompts] = useState<PromptsResponse | null>(null);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [promptWarningKey, setPromptWarningKey] = useState<string | null>(null);
  const [promptModalKey, setPromptModalKey] = useState<string | null>(null);
  const [promptDraftValues, setPromptDraftValues] = useState<Record<string, string>>({});
  const [promptSavingKey, setPromptSavingKey] = useState<string | null>(null);
  const [advancedWritingOpen, setAdvancedWritingOpen] = useState(false);

  // ── Best practices state ──────────────────────────────────────────────────
  const [bestPractices, setBestPractices] = useState('');
  const [bpLoading, setBpLoading] = useState(false);
  const [bpSaving, setBpSaving] = useState(false);
  const [bpModalOpen, setBpModalOpen] = useState(false);
  const [bpDraft, setBpDraft] = useState('');
  const [bpModalPreview, setBpModalPreview] = useState(false);

  // ── Data state ────────────────────────────────────────────────────────────
  const [csvLoading, setCsvLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [fullBackupLoading, setFullBackupLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [fullImportFile, setFullImportFile] = useState<File | null>(null);
  const [fullImporting, setFullImporting] = useState(false);

  // ── Load settings ─────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([getSettings(), getApiKeyStatus()])
      .then(([s, keyStatus]) => {
        setSettings(s);
        setApiKeyConfigured(keyStatus.configured);
      })
      .catch(console.error)
      .finally(() => setSettingsLoading(false));
  }, []);

  // ── Load vault when tab opens ─────────────────────────────────────────────
  useEffect(() => {
    if ((tab === 'setup' || tab === 'vault') && documents.length === 0 && !vaultLoading) {
      setVaultLoading(true);
      getVaultDocuments().then(setDocuments).catch(() => addToast('Failed to load vault', 'error')).finally(() => setVaultLoading(false));
    }
  }, [tab]);

  // ── Load snippets when tab opens ──────────────────────────────────────────
  useEffect(() => {
    if (tab === 'prompt' && snippets.length === 0 && !snippetsLoading) {
      setSnippetsLoading(true);
      getSnippets().then(setSnippets).catch(() => addToast('Failed to load snippets', 'error')).finally(() => setSnippetsLoading(false));
    }
  }, [tab]);

  // ── Load best practices when tab opens ───────────────────────────────────
  useEffect(() => {
    if (tab === 'prompt' && !bpLoading && !bestPractices) {
      setBpLoading(true);
      getBestPractices().then(r => setBestPractices(r.content)).catch(() => addToast('Failed to load writing prompt', 'error')).finally(() => setBpLoading(false));
    }
  }, [tab]);

  // ── Load prompts when tab opens ───────────────────────────────────────────
  useEffect(() => {
    if (tab === 'prompt' && !promptsLoading && !prompts) {
      setPromptsLoading(true);
      getPrompts().then(setPrompts).catch(() => addToast('Failed to load prompts', 'error')).finally(() => setPromptsLoading(false));
    }
  }, [tab]);

  // ── Settings handlers ─────────────────────────────────────────────────────
  const save = async (updates: Partial<SettingsType>) => {
    setSaving(true);
    try {
      const updated = await updateSettings(updates);
      setSettings(prev => ({ ...prev, ...updated }));
      addToast('Saved', 'success');
    } catch {
      addToast('Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const res = await fetch('/api/health');
      setConnectionResult(res.ok ? 'ok' : 'fail');
      if (res.ok) addToast('Connection OK', 'success');
    } catch {
      setConnectionResult('fail');
      addToast('Connection failed', 'error');
    } finally {
      setTestingConnection(false);
    }
  };

  // ── Vault handlers ────────────────────────────────────────────────────────
  const reloadVault = async () => {
    const docs = await getVaultDocuments();
    setDocuments(docs);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      fd.append('label', selectedFile.name);
      fd.append('doc_type', newDocType);
      await uploadDocument(fd);
      await reloadVault();
      setSelectedFile(null);
      addToast('Document uploaded', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally { setUploading(false); }
  };

  const handleSetDefault = async (doc: VaultDocument) => {
    try {
      await updateDocument(doc.id, { is_default: 1 });
      await reloadVault();
      addToast(`${doc.filename} set as default`, 'success');
    } catch { addToast('Failed to update', 'error'); }
  };

  const handlePreviewText = async (doc: VaultDocument) => {
    setPreviewDoc(doc);
    setPreviewText('');
    setPreviewLoading(true);
    try {
      const res = await getVaultDocumentText(doc.id);
      setPreviewText(res.text || '(no text extracted)');
    } catch { setPreviewText('Failed to load text.'); }
    finally { setPreviewLoading(false); }
  };

  const handleDeleteDoc = async (doc: VaultDocument) => {
    try {
      await deleteDocument(doc.id);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      addToast('Deleted', 'success');
    } catch { addToast('Failed to delete', 'error'); }
  };

  // ── Snippet handlers ──────────────────────────────────────────────────────
  const handleCreateSnippet = async () => {
    if (!newTitle.trim() || !newContent.trim()) { addToast('Title and content required', 'error'); return; }
    setCreating(true);
    try {
      const s = await createSnippet({ title: newTitle.trim(), content: newContent.trim(), checked_by_default: newDefault ? 1 : 0 });
      setSnippets(prev => [...prev, s]);
      setNewTitle(''); setNewContent(''); setNewDefault(false); setShowSnippetForm(false);
      addToast('Snippet created', 'success');
    } catch { addToast('Failed to create', 'error'); }
    finally { setCreating(false); }
  };

  const handleEditSnippet = (s: Snippet) => {
    setEditingId(s.id); setEditTitle(s.title); setEditContent(s.content); setEditDefault(s.checked_by_default === 1);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSnippetSaving(true);
    try {
      const updated = await updateSnippet(editingId, { title: editTitle.trim(), content: editContent.trim(), checked_by_default: editDefault ? 1 : 0 });
      setSnippets(prev => prev.map(s => s.id === editingId ? updated : s));
      setEditingId(null);
      addToast('Updated', 'success');
    } catch { addToast('Failed to update', 'error'); }
    finally { setSnippetSaving(false); }
  };

  const handleDeleteSnippet = async (id: string) => {
    try {
      await deleteSnippet(id);
      setSnippets(prev => prev.filter(s => s.id !== id));
      addToast('Deleted', 'success');
    } catch { addToast('Failed to delete', 'error'); }
  };

  // ── Data handlers ─────────────────────────────────────────────────────────
  const handleExportCsv = async () => {
    setCsvLoading(true);
    try {
      const url = await exportCSV();
      const a = document.createElement('a');
      a.href = url; a.download = `applyr_export_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
      addToast('CSV exported', 'success');
    } catch (err) { addToast(err instanceof Error ? err.message : 'Export failed', 'error'); }
    finally { setCsvLoading(false); }
  };

  const handleExportConfig = async () => {
    setConfigLoading(true);
    try {
      const data = await exportConfig();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `applyr_config_${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
      addToast('Config exported', 'success');
    } catch (err) { addToast(err instanceof Error ? err.message : 'Export failed', 'error'); }
    finally { setConfigLoading(false); }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const data = JSON.parse(await importFile.text());
      const result = await importConfig(data);
      addToast(`Import complete: ${result.settingsUpdated} settings, ${result.snippetsImported} snippets`, 'success');
      setImportFile(null);
    } catch (err) { addToast(err instanceof Error ? err.message : 'Import failed', 'error'); }
    finally { setImporting(false); }
  };

  const handleExportFullBackup = async () => {
    setFullBackupLoading(true);
    try {
      const url = await exportFullBackup();
      const a = document.createElement('a');
      a.href = url; a.download = `applyr_backup_${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
      addToast('Full backup downloaded', 'success');
    } catch (err) { addToast(err instanceof Error ? err.message : 'Export failed', 'error'); }
    finally { setFullBackupLoading(false); }
  };

  const handleFullImport = async () => {
    if (!fullImportFile) return;
    setFullImporting(true);
    try {
      const data = JSON.parse(await fullImportFile.text());
      const result = await importFullBackup(data);
      const r = result.restored;
      addToast(`Restore complete: ${r.applications} applications, ${r.snippets} snippets, ${r.vault_documents} vault docs, ${r.generation_log} cover letters`, 'success');
      setFullImportFile(null);
    } catch (err) { addToast(err instanceof Error ? err.message : 'Restore failed', 'error'); }
    finally { setFullImporting(false); }
  };

  if (settingsLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const filteredDocs = vaultTab === 'all' ? documents : documents.filter(d => d.doc_type === vaultTab);
  const defaultCv = documents.find(d => d.doc_type === 'cv' && d.is_default) || documents.find(d => d.doc_type === 'cv');
  const defaultTemplate = documents.find(d => d.doc_type === 'cover_letter_template' && d.is_default) || documents.find(d => d.doc_type === 'cover_letter_template');
  const aiConfigured = apiKeyConfigured || settings.ai_provider === 'ollama';
  const aiDetail = settings.ai_provider === 'ollama'
    ? `Ollama selected${settings.ai_model ? `, model ${settings.ai_model}` : ''}`
    : `API key configured${settings.ai_model ? `, model ${settings.ai_model}` : ''}`;
  const cvDetail = defaultCv ? `${defaultCv.label || defaultCv.filename}${(defaultCv.has_extracted_text || defaultCv.extracted_text) ? ' - text extracted' : ' - no extracted text yet'}` : '';
  const templateDetail = defaultTemplate ? `${defaultTemplate.label || defaultTemplate.filename}` : '';
  const outputDetail = settings.output_dir?.trim() || 'Using the server default output folder';

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: theme.text }}>Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: theme.text2 }}>Manage setup, AI, documents, output, writing, appearance, and data.</p>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: '4px',
        marginBottom: '24px',
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        padding: '4px',
        flexWrap: 'wrap',
      }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => selectTab(id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
              transition: 'all 0.15s',
              background: tab === id ? `${theme.accent}18` : 'transparent',
              color: tab === id ? theme.accent : theme.text2,
              boxShadow: tab === id ? `inset 0 0 0 1px ${theme.accent}40` : 'none',
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Themes ──────────────────────────────────────────────────────── */}
      {tab === 'setup' && (
        <SetupStatus
          aiDone={aiConfigured}
          cvDone={Boolean(defaultCv)}
          templateDone={Boolean(defaultTemplate)}
          outputDone={Boolean(settings.output_dir?.trim())}
          aiDetail={aiDetail}
          cvDetail={cvDetail}
          templateDetail={templateDetail}
          outputDetail={outputDetail}
          checkingDocuments={vaultLoading}
          onSelectTab={selectTab}
        />
      )}

      {tab === 'themes' && (
        <Section title="Appearance" subtitle="Choose how Applyr looks to you.">
          <ThemePicker />

        </Section>
      )}

      {/* ── AI Config ───────────────────────────────────────────────────── */}
      {tab === 'ai' && (() => {
        const activeProvider = settings.ai_provider === 'ollama' ? 'ollama' : 'openai';

        const switchProvider = (provider: 'openai' | 'ollama') => {
          if (provider === 'ollama') {
            // Back up OpenAI config before switching
            localStorage.setItem('applyr_openai_model', settings.ai_model || '');
            localStorage.setItem('applyr_openai_base_url', settings.ai_base_url || '');
            setSettings(prev => ({
              ...prev,
              ai_provider: 'ollama',
              ai_base_url: 'http://localhost:11434/v1',
            }));
            // Reset Ollama detection state
            setOllamaModels([]);
            setOllamaDetected(false);
            setOllamaError(null);
          } else {
            // Restore OpenAI config
            const savedModel = localStorage.getItem('applyr_openai_model');
            const savedUrl = localStorage.getItem('applyr_openai_base_url');
            setSettings(prev => ({
              ...prev,
              ai_provider: 'openai',
              ai_model: savedModel !== null ? savedModel : (prev.ai_model || 'gpt-4o'),
              ai_base_url: savedUrl !== null ? savedUrl : '',
            }));
          }
        };

        return (
          <Section title="AI configuration" subtitle="Choose a provider, then configure your model and credentials.">
            <div className="space-y-5">

              {/* ── Provider toggle ───────────────────────────────────────── */}
              <div>
                <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">Provider</label>
                <div className="grid grid-cols-2 gap-3">
                  {/* OpenAI card */}
                  <button
                    type="button"
                    onClick={() => switchProvider('openai')}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-colors ${
                      activeProvider === 'openai'
                        ? 'border-accent bg-accent/10 dark:bg-accent/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                      activeProvider === 'openai' ? 'border-accent' : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {activeProvider === 'openai' && <div className="w-2 h-2 rounded-full bg-accent" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">OpenAI / API</p>
                      <p className="text-xs mt-0.5" style={{ color: theme.text2 }}>GPT-4o, Claude, Azure, or any OpenAI-compatible API</p>
                    </div>
                  </button>

                  {/* Ollama card */}
                  <button
                    type="button"
                    onClick={() => switchProvider('ollama')}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-colors ${
                      activeProvider === 'ollama'
                        ? 'border-accent bg-accent/10 dark:bg-accent/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                      activeProvider === 'ollama' ? 'border-accent' : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {activeProvider === 'ollama' && <div className="w-2 h-2 rounded-full bg-accent" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Ollama <span className="text-xs font-normal text-green-600 dark:text-green-400">local</span></p>
                      <p className="text-xs mt-0.5" style={{ color: theme.text2 }}>Runs on your machine — no API key, fully private</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* ── OpenAI fields ─────────────────────────────────────────── */}
              {activeProvider === 'openai' && (
                <>
                  <div>
                    <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">Model</label>
                    <Input type="text" placeholder="gpt-4o" value={settings.ai_model || ''} onChange={e => setSettings(prev => ({ ...prev, ai_model: e.target.value }))} />
                    <p className="text-xs mt-1" style={{ color: theme.text2 }}>e.g. gpt-4o, gpt-4-turbo, claude-3-opus-20240229</p>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">Temperature <span className="font-normal" style={{ color: theme.text2 }}>(optional)</span></label>
                    <Input
                      type="number"
                      placeholder="Model default"
                      min="0" max="2" step="0.1"
                      value={settings.ai_temperature ?? ''}
                      onChange={e => setSettings(prev => ({ ...prev, ai_temperature: e.target.value }))} />
                    <p className="text-xs mt-1" style={{ color: theme.text2 }}>Leave blank to use per-function defaults. Set to 1 for models like gpt-5.5 that only support the default value.</p>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">
                      API Key
                      {apiKeyConfigured && <span className="ml-2 inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400"><CheckCircle className="w-3 h-3" /> Configured</span>}
                    </label>
                    <div className="relative">
                      <Input type={showApiKey ? 'text' : 'password'} placeholder={apiKeyConfigured ? '••••••••••••••••' : 'sk-...'} value={apiKey} onChange={e => setApiKey(e.target.value)} className="pr-10" />
                      <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">Base URL <span className="font-normal" style={{ color: theme.text2 }}>(optional)</span></label>
                    <Input type="url" placeholder="https://api.openai.com/v1" value={settings.ai_base_url || ''} onChange={e => setSettings(prev => ({ ...prev, ai_base_url: e.target.value }))} />
                    <p className="text-xs mt-1" style={{ color: theme.text2 }}>Leave blank for OpenAI. Set for Azure, proxies, or other compatible APIs.</p>
                  </div>
                </>
              )}

              {/* ── Ollama fields ─────────────────────────────────────────── */}
              {activeProvider === 'ollama' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    <span>Running locally — zero data leaves your machine. Your OpenAI settings are preserved and will be restored if you switch back.</span>
                  </div>

                  <div className="space-y-3">
                    <Button
                      onClick={async () => {
                        setOllamaDetecting(true);
                        setOllamaError(null);
                        setOllamaDetected(false);
                        try {
                          const result = await getLocalModels();
                          if (result.error) {
                            setOllamaError(result.message || 'Could not reach Ollama');
                            setOllamaModels([]);
                          } else {
                            setOllamaModels(result.models);
                            setOllamaDetected(true);
                            if (result.models.length === 0) {
                              setOllamaError('Ollama found but no models downloaded. Run `ollama pull <model>`.');
                            } else if (!settings.ai_model || !result.models.includes(settings.ai_model)) {
                              setSettings(prev => ({ ...prev, ai_model: result.models[0] }));
                            }
                          }
                        } catch {
                          setOllamaError('Failed to contact server');
                        } finally {
                          setOllamaDetecting(false);
                        }
                      }}
                      disabled={ollamaDetecting}
                      className="flex items-center gap-2 text-sm">
                      {ollamaDetecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
                      {ollamaDetected ? 'Re-detect models' : 'Detect Ollama'}
                    </Button>

                    {ollamaError && (
                      <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{ollamaError}{' '}
                          <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer" className="underline">Install Ollama</a>
                        </span>
                      </div>
                    )}

                    {ollamaDetected && ollamaModels.length > 0 ? (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">Ollama URL</label>
                          <Input
                            type="url"
                            placeholder="http://localhost:11434"
                            value={settings.ai_ollama_url || ''}
                            onChange={e => setSettings(prev => ({ ...prev, ai_ollama_url: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">Model</label>
                          <Select
                            
                            value={settings.ai_model || ''}
                            onChange={e => setSettings(prev => ({ ...prev, ai_model: e.target.value }))}
                          >
                            {ollamaModels.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">Ollama URL</label>
                          <Input
                            type="url"
                            placeholder="http://localhost:11434"
                            value={settings.ai_ollama_url || ''}
                            onChange={e => setSettings(prev => ({ ...prev, ai_ollama_url: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">Model <span className="font-normal" style={{ color: theme.text2 }}>(or detect above)</span></label>
                          <Input
                            type="text"
                            placeholder="llama3.2"
                            value={settings.ai_model || ''}
                            onChange={e => setSettings(prev => ({ ...prev, ai_model: e.target.value }))} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="primary" onClick={async () => {
                  const updates: Partial<SettingsType> = {
                    ai_provider: settings.ai_provider || 'openai',
                    ai_model: settings.ai_model || '',
                    ai_base_url: settings.ai_base_url || '',
                    ai_temperature: settings.ai_temperature ?? '',
                  };
                  if (apiKey.trim()) updates.ai_api_key = apiKey;
                  await save(updates);
                  if (apiKey.trim()) { setApiKey(''); setApiKeyConfigured(true); }
                }} disabled={saving} className="flex items-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save
                </Button>
                <Button onClick={testConnection} disabled={testingConnection} className="flex items-center gap-2" title="Checks that the Applyr server is reachable. This does not validate the AI provider.">
                  {testingConnection ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
                  Test app server
                  {connectionResult === 'ok' && <CheckCircle className="w-4 h-4 text-green-500" />}
                  {connectionResult === 'fail' && <AlertCircle className="w-4 h-4 text-red-500" />}
                </Button>
            </div>
          </div>
        </Section>
        );
      })()}

      {/* ── Prompt ──────────────────────────────────────────────────────── */}
      {tab === 'prompt' && (
        <div className="space-y-6">
          <Section title="Application writing prompt" subtitle="Custom guidelines the AI follows when writing cover letters. Markdown supported.">
            {bpLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: theme.accent }} />
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}>
                <div className="rounded-lg p-2 flex-shrink-0" style={{ background: `${theme.accent}18` }}>
                  <BookText className="w-4 h-4" style={{ color: theme.accent }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold mb-0.5" style={{ color: theme.text }}>Application writing prompt</p>
                  <p className="text-xs truncate" style={{ color: theme.text2 }}>
                    {bestPractices
                      ? bestPractices.split('\n').find(l => l.trim()) ?? 'No guidelines defined'
                      : 'No custom guidelines defined yet'}
                  </p>
                </div>
                <Button
                  onClick={() => { setBpDraft(bestPractices); setBpModalPreview(false); setBpModalOpen(true); }}
                  className="flex items-center gap-1.5 flex-shrink-0"
                  style={{ fontSize: '12px', padding: '5px 10px' }}>
                  <Edit2 className="w-3 h-3" /> Edit
                </Button>
              </div>
            )}

            {bpModalOpen && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
                <div className="flex flex-col w-full sm:max-w-2xl mx-4 rounded-2xl shadow-2xl overflow-hidden" style={{ background: theme.surface, border: `1px solid ${theme.border}`, maxHeight: '90vh' }}>
                  {/* Header */}
                  <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <div className="rounded-lg p-2 flex-shrink-0" style={{ background: `${theme.accent}18` }}>
                      <BookText className="w-4 h-4" style={{ color: theme.accent }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm" style={{ color: theme.text }}>Application writing prompt</h3>
                      <p className="text-xs mt-0.5" style={{ color: theme.text2 }}>Cover letter guidelines · Markdown supported</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => setBpModalPreview(p => !p)}
                        className="flex items-center gap-1.5"
                        style={{ fontSize: '12px', padding: '5px 10px' }}>
                        {bpModalPreview ? <Edit2 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {bpModalPreview ? 'Edit' : 'Preview'}
                      </Button>
                      <button onClick={() => setBpModalOpen(false)} style={{ color: theme.text2 }}>
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  {/* Body */}
                  <div className="flex-1 overflow-auto p-5">
                    {bpModalPreview ? (
                      <div className="rounded-xl border p-5 min-h-[320px]" style={{ borderColor: theme.border, background: theme.surface2 }}>
                        {bpDraft
                          ? <MarkdownPreview content={bpDraft} />
                          : <p className="text-sm" style={{ color: theme.text2 }}>Nothing to preview yet.</p>
                        }
                      </div>
                    ) : (
                      <Textarea
                        value={bpDraft}
                        onChange={e => setBpDraft(e.target.value)}
                        className="font-mono text-xs resize-none"
                        style={{ width: '100%', height: '380px' }}
                        placeholder="Add guidelines that the AI should follow when writing cover letters..."
                        autoFocus />
                    )}
                  </div>
                  {/* Footer */}
                  <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: `1px solid ${theme.border}` }}>
                    <Button onClick={() => setBpModalOpen(false)} className="flex items-center gap-1.5 text-sm">
                      <X className="w-3.5 h-3.5" /> Cancel
                    </Button>
                    <Button variant="primary"
                      onClick={async () => {
                        setBpSaving(true);
                        try {
                          await updateBestPractices(bpDraft);
                          setBestPractices(bpDraft);
                          setBpModalOpen(false);
                          addToast('Writing prompt saved', 'success');
                        } catch {
                          addToast('Failed to save', 'error');
                        } finally {
                          setBpSaving(false);
                        }
                      }}
                      disabled={bpSaving}
                      className="flex items-center gap-1.5 text-sm">
                      {bpSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Section>

          <Section title="Advanced: System prompts" subtitle="Low-level AI instructions. Locked by default and rarely needed for normal writing setup.">
            <Button
              onClick={() => setAdvancedWritingOpen(open => !open)}
              className="flex items-center gap-2 text-sm">
              {advancedWritingOpen ? 'Hide system prompts' : 'Show system prompts'}
            </Button>

            {advancedWritingOpen && (<>
            {promptsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: theme.accent }} />
              </div>
            ) : prompts ? (
              <div className="space-y-2">
                {Object.entries(prompts.prompts).map(([key, value]) => {
                  const isCustom = prompts.customized.includes(key);
                  const meta = PROMPT_META[key] ?? { title: key, icon: Terminal };
                  const Icon = meta.icon as React.ElementType;
                  const teaser = value.split('\n').find(l => l.trim()) ?? '';

                  return (
                    <div key={key} className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}>
                      <div className="rounded-lg p-2 flex-shrink-0" style={{ background: `${theme.accent}18` }}>
                        <Icon className="w-4 h-4" style={{ color: theme.accent }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold" style={{ color: theme.text }}>{meta.title}</span>
                          {isCustom && (
                            <span className="text-xs px-1.5 py-px rounded-full font-medium" style={{ background: `${theme.accent}20`, color: theme.accent }}>
                              Custom
                            </span>
                          )}
                        </div>
                        <p className="text-xs truncate" style={{ color: theme.text2 }}>{teaser}</p>
                      </div>
                      <Button
                        onClick={() => setPromptWarningKey(key)}
                        className="flex items-center gap-1.5 flex-shrink-0"
                        style={{ fontSize: '12px', padding: '5px 10px' }}>
                        <Lock className="w-3 h-3" /> Edit
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm" style={{ color: theme.text2 }}>Failed to load prompts.</p>
            )}

            {/* Warning gate */}
            {promptWarningKey && (
              <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
                <div className="rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
                  <div className="flex items-start gap-3 mb-4">
                    <div className="rounded-full p-2 flex-shrink-0" style={{ background: '#f59e0b20' }}>
                      <AlertTriangle className="w-5 h-5" style={{ color: '#f59e0b' }} />
                    </div>
                    <div>
                      <h3 className="font-bold text-base mb-1" style={{ color: theme.text }}>Edit system prompt?</h3>
                      <p className="text-sm leading-relaxed" style={{ color: theme.text2 }}>
                        Modifying system prompts can significantly affect the quality and behaviour of AI-generated content. This is <strong>strongly discouraged</strong> unless you know what you're doing.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button onClick={() => setPromptWarningKey(null)}>Cancel</Button>
                    <button
                      onClick={() => {
                        const key = promptWarningKey;
                        setPromptWarningKey(null);
                        setPromptModalKey(key);
                        setPromptDraftValues(prev => ({ ...prev, [key]: prompts?.prompts[key] ?? '' }));
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
                      style={{ background: '#f59e0b', color: '#fff' }}
                    >
                      <Unlock className="w-4 h-4" /> I understand, edit anyway
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Edit modal */}
            {promptModalKey && prompts && (() => {
              const key = promptModalKey;
              const meta = PROMPT_META[key] ?? { title: key, icon: Terminal };
              const Icon = meta.icon as React.ElementType;
              const isCustom = prompts.customized.includes(key);
              const draftValue = promptDraftValues[key] ?? prompts.prompts[key] ?? '';
              return (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
                  <div className="flex flex-col w-full sm:max-w-2xl mx-4 rounded-2xl shadow-2xl overflow-hidden" style={{ background: theme.surface, border: `1px solid ${theme.border}`, maxHeight: '90vh' }}>
                    {/* Header */}
                    <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <div className="rounded-lg p-2 flex-shrink-0" style={{ background: `${theme.accent}18` }}>
                        <Icon className="w-4 h-4" style={{ color: theme.accent }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm" style={{ color: theme.text }}>{meta.title}</h3>
                          {isCustom && (
                            <span className="text-xs px-1.5 py-px rounded-full font-medium" style={{ background: `${theme.accent}20`, color: theme.accent }}>Custom</span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: theme.text2 }}>System prompt</p>
                      </div>
                      <button onClick={() => { setPromptModalKey(null); setPromptDraftValues(prev => { const n = { ...prev }; delete n[key]; return n; }); }} style={{ color: theme.text2 }}>
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    {/* Body */}
                    <div className="flex-1 overflow-auto p-5">
                      <Textarea
                        value={draftValue}
                        onChange={e => setPromptDraftValues(prev => ({ ...prev, [key]: e.target.value }))}
                        className="font-mono text-xs resize-none"
                        style={{ width: '100%', height: '380px' }}
                        autoFocus />
                    </div>
                    {/* Footer */}
                    <div className="flex items-center justify-between gap-2 px-5 py-4" style={{ borderTop: `1px solid ${theme.border}` }}>
                      <div>
                        {isCustom && (
                          <Button
                            onClick={async () => {
                              setPromptSavingKey(key);
                              try {
                                await resetPrompt(key);
                                const updated = await getPrompts();
                                setPrompts(updated);
                                setPromptModalKey(null);
                                setPromptDraftValues(prev => { const n = { ...prev }; delete n[key]; return n; });
                                addToast('Prompt reset to default', 'success');
                              } catch {
                                addToast('Failed to reset prompt', 'error');
                              } finally {
                                setPromptSavingKey(null);
                              }
                            }}
                            disabled={promptSavingKey === key}
                            className="flex items-center gap-1.5 text-sm">
                            {promptSavingKey === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                            Reset to default
                          </Button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => { setPromptModalKey(null); setPromptDraftValues(prev => { const n = { ...prev }; delete n[key]; return n; }); }}
                          className="flex items-center gap-1.5 text-sm">
                          <X className="w-3.5 h-3.5" /> Cancel
                        </Button>
                        <Button variant="primary"
                          onClick={async () => {
                            setPromptSavingKey(key);
                            try {
                              await updatePrompt(key, draftValue);
                              const updated = await getPrompts();
                              setPrompts(updated);
                              setPromptModalKey(null);
                              addToast('Prompt saved', 'success');
                            } catch {
                              addToast('Failed to save prompt', 'error');
                            } finally {
                              setPromptSavingKey(null);
                            }
                          }}
                          disabled={promptSavingKey === key}
                          className="flex items-center gap-1.5 text-sm">
                          {promptSavingKey === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
            </>)}
          </Section>
        </div>
      )}

      {/* ── Output ──────────────────────────────────────────────────────── */}
        {tab === 'output' && (
          <Section title="Output directory" subtitle="Where to save generated cover letters and analysis files.">
            <div className="space-y-4">
              <div className="rounded-xl px-4 py-3 text-sm" style={{ background: theme.surface2, border: `1px solid ${theme.border}`, color: theme.text2 }}>
                <p>
                  Running in Docker? Use a container path such as <code className="font-mono px-1 rounded" style={{ background: `${theme.accent}18`, color: theme.accent }}>/app/output</code>. To save files on your computer, mount a local folder to that path in Docker Compose.
                </p>
                <div className="mt-2 grid gap-1 text-xs font-mono">
                  <span>macOS: /Users/yourname/Documents/Applyr:/app/output</span>
                  <span>Windows: C:/Users/yourname/Documents/Applyr:/app/output</span>
                  <span>Linux: /home/yourname/Documents/Applyr:/app/output</span>
                </div>
              </div>
              <div className="flex gap-2">
              <Input
                type="text"
                placeholder="/app/output or C:\Users\You\Documents\Applyr"
                value={settings.output_dir || ''}
                onChange={e => setSettings(prev => ({ ...prev, output_dir: e.target.value }))}
                className="font-mono text-sm flex-1" />
              <button onClick={() => setShowBrowser(true)} className="btn" title="Browse folders">
                <FolderOpen className="w-4 h-4" />
              </button>
              </div>
              <p className="text-xs" style={{ color: theme.text2 }}>
                Local development can use a normal folder path. Docker can only write to paths inside the container unless you mount a host folder.
              </p>
            </div>
            <Button variant="primary" onClick={() => save({ output_dir: settings.output_dir })} disabled={saving} className="mt-3">
              {saving ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null} Save
          </Button>
          <FileBrowser
            isOpen={showBrowser}
            onClose={() => setShowBrowser(false)}
            onSelect={p => { setSettings(prev => ({ ...prev, output_dir: p })); setShowBrowser(false); }}
            initialPath={settings.output_dir || undefined}
          />
        </Section>
      )}

      {/* ── Vault ───────────────────────────────────────────────────────── */}
      {tab === 'vault' && (
        <div>
          {!documents.some(d => d.doc_type === 'cv') && (
            <div className="mb-5 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-red-800 dark:text-red-300">CV / Resume document missing</p>
                  <p className="text-sm mt-1 text-red-700 dark:text-red-400">
                    Add a <strong>CV / Resume</strong> document so Applyr can run fit analysis and generate cover letters using your experience.
                  </p>
                  <p className="text-xs mt-2 text-red-600 dark:text-red-400">
                    Upload your CV below and choose <strong>CV / Resume</strong> as the document type. PDF, ODT, DOCX, TXT, and Markdown files are supported.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!documents.some(d => d.doc_type === 'cover_letter_template') && (
            <div className="mb-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
              <div className="flex items-start gap-3">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400 dark:text-gray-500" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Cover letter template (optional)</p>
                  <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
                    Add an <strong>.odt</strong> file as a Cover Letter Template to get formatted output files. Include these two placeholder tags in the document:
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <code className="rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-2 py-1 text-xs font-mono text-gray-600 dark:text-gray-300">[heading]</code>
                    <code className="rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-2 py-1 text-xs font-mono text-gray-600 dark:text-gray-300">[text]</code>
                  </div>
                </div>
              </div>
            </div>
          )}

          <Section title="Upload document" subtitle="Add CVs, cover letters, and portfolio documents.">
            <FileDropzone
              accept=".pdf,.doc,.docx,.odt,.txt,.md"
              onFile={file => setSelectedFile(file)}
              selectedFile={selectedFile}
              onClear={() => setSelectedFile(null)}
              label="Drop your document here (PDF, ODT, DOC, TXT, MD)"
            />
            {selectedFile && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">Document type</label>
                  <Select value={newDocType} onChange={e => setNewDocType(e.target.value as DocType)}>
                    {DOC_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  </Select>
                </div>
                <Button variant="primary" onClick={handleUpload} disabled={uploading} className="flex items-center gap-2">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Upload Document
                </Button>
              </div>
            )}
          </Section>

          <Section title="Documents" subtitle="Manage your stored documents.">
            {/* Document type info */}
            <div className="mb-4">
              <button
                onClick={() => setDocTypesOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs font-medium"
                style={{ color: docTypesOpen ? theme.accent : theme.text2 }}
              >
                <Info className="w-3.5 h-3.5" />
                {docTypesOpen ? 'Hide document types' : 'About document types'}
              </button>
              {docTypesOpen && (
                <div className="mt-3 space-y-2">
                  {([
                    {
                      type: 'cv' as DocType,
                      desc: 'Your main CV or résumé. Selected when running fit analysis and generating cover letters. Star one to set it as the default.',
                    },
                    {
                      type: 'cover_letter_template' as DocType,
                      desc: 'An ODT file that defines the visual layout of generated output files. The AI-written letter is injected into it using two placeholder tags:',
                      tags: [
                        { tag: '[heading]', desc: 'Replaced with the first line of the letter (e.g. subject or salutation). Works inside any paragraph or heading element.' },
                        { tag: '[text]', desc: 'Replaced with the body of the letter. Double line breaks become separate paragraphs; single line breaks become line breaks.' },
                      ],
                    },
                    {
                      type: 'cover_letter' as DocType,
                      desc: 'A finished cover letter saved for reference. Not used in generation.',
                    },
                    {
                      type: 'portfolio' as DocType,
                      desc: 'Portfolio samples or work examples. Stored for reference.',
                    },
                    {
                      type: 'attachment' as DocType,
                      desc: 'Any file you want to keep alongside an application (certificates, references, etc.).',
                    },
                    {
                      type: 'other' as DocType,
                      desc: 'Miscellaneous documents that don\'t fit another category.',
                    },
                  ] as { type: DocType; desc: string; tags?: { tag: string; desc: string }[] }[]).map(({ type, desc, tags }) => (
                    <div key={type} style={{ borderRadius: '10px', border: `1px solid ${theme.border}`, padding: '10px 12px', background: theme.surface2 }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${TYPE_COLORS[type]}`}>
                          {TYPE_LABELS[type]}
                        </span>
                      </div>
                      <p className="text-sm" style={{ color: theme.text2 }}>{desc}</p>
                      {tags && (
                        <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-accent/30">
                          {tags.map(({ tag, desc: tagDesc }) => (
                            <div key={tag} className="flex items-start gap-2">
                              <code className="text-xs font-mono px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: `${theme.accent}22`, color: theme.accent }}>{tag}</code>
                              <span className="text-xs" style={{ color: theme.text2 }}>{tagDesc}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: `${theme.accent}11`, border: `1px solid ${theme.accent}33` }}>
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: theme.accent }} />
                    <p className="text-xs" style={{ color: theme.text2 }}>
                      Cover Letter Template must be an <strong style={{ color: theme.text }}>.odt</strong> file (OpenDocument Text). Create it in LibreOffice Writer or any ODT-compatible editor, place <code className="font-mono px-1 rounded" style={{ background: `${theme.accent}22`, color: theme.accent }}>[heading]</code> and <code className="font-mono px-1 rounded" style={{ background: `${theme.accent}22`, color: theme.accent }}>[text]</code> inside text paragraphs, and save as ODT.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Filter pills */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {(['all', ...DOC_TYPES] as Array<DocType | 'all'>).map(t => (
                <button key={t} onClick={() => setVaultTab(t)} style={{
                  padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                  background: vaultTab === t ? theme.accent : theme.surface2,
                  color: vaultTab === t ? 'white' : theme.text2,
                  border: `1px solid ${vaultTab === t ? theme.accent : theme.border}`,
                  transition: 'all 0.15s',
                }}>
                  {t === 'all' ? 'All' : TYPE_LABELS[t]}
                </button>
              ))}
            </div>

            {vaultLoading ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-accent border-t-transparent rounded-full animate-spin" /></div>
            ) : filteredDocs.length === 0 ? (
              <div className="text-center py-8">
                <FolderOpen className="w-8 h-8 mx-auto mb-2" style={{ color: theme.text2, opacity: 0.4 }} />
                <p style={{ color: theme.text2, fontSize: '14px' }}>No documents yet</p>
              </div>
            ) : (
              <div style={{ border: `1px solid ${theme.border}`, borderRadius: '12px', overflow: 'hidden' }}>
                {filteredDocs.map((doc, i) => (
                  <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5" style={{
                    background: theme.surface2,
                    borderTop: i > 0 ? `1px solid ${theme.border}` : 'none',
                  }}>
                    <FileText className="w-4 h-4 flex-shrink-0" style={{ color: theme.text2 }} />

                    <span className="font-medium text-sm truncate flex-1 min-w-0" style={{ color: theme.text }}>
                      {doc.filename}
                    </span>

                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${TYPE_COLORS[doc.doc_type]}`}>
                      {TYPE_LABELS[doc.doc_type]}
                    </span>

                    <span className="text-xs flex-shrink-0 w-24 text-right" style={{ color: theme.text2 }}>
                      {new Date(doc.created_at).toLocaleDateString()}
                    </span>

                    {doc.is_default === 1 ? (
                      <Star className="w-3.5 h-3.5 flex-shrink-0 text-yellow-500" fill="currentColor" />
                    ) : (
                      <button onClick={() => handleSetDefault(doc)} title="Set as default" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: theme.border }} className="flex-shrink-0 hover:text-yellow-500 transition-colors">
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button onClick={() => handlePreviewText(doc)} title="View extracted text" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: theme.border }} className="flex-shrink-0 hover:text-accent transition-colors">
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    <button onClick={() => setDeleteDocTarget(doc)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: theme.border }} className="flex-shrink-0 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      {/* ── Extracted text preview modal ────────────────────────────────── */}
      <Modal open={!!previewDoc} onClose={() => setPreviewDoc(null)} title={previewDoc ? `Extracted text — ${previewDoc.filename}` : ''}>
        {previewLoading ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-accent border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '13px', lineHeight: '1.6', color: 'inherit', fontFamily: 'inherit', margin: 0 }}>{previewText}</pre>
        )}
      </Modal>

      {/* ── Snippets ────────────────────────────────────────────────────── */}
      {tab === 'prompt' && (
        <div>
          <Section title="Snippets" subtitle="Reusable achievements, strengths, or standard paragraphs to include in generated letters.">
            <div className="flex justify-end mb-2">
              <Button variant="primary" onClick={() => setShowSnippetForm(!showSnippetForm)} className="flex items-center gap-2 text-sm">
                {showSnippetForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {showSnippetForm ? 'Cancel' : 'Add Snippet'}
              </Button>
            </div>

            {showSnippetForm && (
              <div style={{ background: theme.surface2, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '16px', marginBottom: '16px' }} className="space-y-3">
                <div>
                  <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">Title</label>
                  <Input type="text" placeholder="e.g. Leadership Experience" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">Content</label>
                  <Textarea placeholder="Write the snippet content..." value={newContent} onChange={e => setNewContent(e.target.value)} rows={4} className="resize-y" />
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={newDefault} onChange={e => setNewDefault(e.target.checked)} className="w-4 h-4 rounded" />
                  <span className="text-sm" style={{ color: theme.text }}>Include by default in new applications</span>
                </label>
                <Button variant="primary" onClick={handleCreateSnippet} disabled={creating || !newTitle || !newContent} className="flex items-center gap-2">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create Snippet
                </Button>
              </div>
            )}

            {snippetsLoading ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-accent border-t-transparent rounded-full animate-spin" /></div>
            ) : snippets.length === 0 ? (
              <div className="text-center py-8">
                <BookText className="w-8 h-8 mx-auto mb-2" style={{ color: theme.text2, opacity: 0.4 }} />
                <p style={{ color: theme.text2, fontSize: '14px' }}>No snippets yet. Add reusable content you often want included in cover letters.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {snippets.map(snippet => (
                  <div key={snippet.id} style={{ background: theme.surface2, border: `1px solid ${theme.border}`, borderRadius: '12px', overflow: 'hidden' }}>
                    {editingId === snippet.id ? (
                      <div className="p-4 space-y-3">
                        <Input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} className="font-medium" />
                        <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={4} className="resize-y text-sm" />
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" checked={editDefault} onChange={e => setEditDefault(e.target.checked)} className="w-4 h-4 rounded" />
                          <span className="text-sm" style={{ color: theme.text }}>Include by default</span>
                        </label>
                        <div className="flex gap-2">
                          <Button variant="primary" onClick={handleSaveEdit} disabled={snippetSaving} className="flex items-center gap-2 text-sm">
                            {snippetSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                          </Button>
                          <Button onClick={() => setEditingId(null)} className="text-sm">Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium" style={{ color: theme.text, fontSize: '14px' }}>{snippet.title}</h3>
                              {snippet.checked_by_default === 1 && (
                                <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                                  <CheckCircle className="w-3 h-3" /> Default
                                </span>
                              )}
                            </div>
                            <p className="text-sm line-clamp-2 mt-1" style={{ color: theme.text2 }}>{snippet.content}</p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => handleEditSnippet(snippet)} style={{ padding: '6px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer', color: theme.text2 }}>
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => setDeleteSnippetTarget(snippet.id)} style={{ padding: '6px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      {/* ── Data ────────────────────────────────────────────────────────── */}
      {tab === 'data' && (
        <div>
          <Section title="Settings" subtitle="Export or import your settings and snippets.">
            <div className="flex gap-3">
              <button
                onClick={handleExportConfig}
                disabled={configLoading}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all hover:opacity-80"
                style={{ background: theme.surface2, color: theme.text, border: `1px solid ${theme.border}`, opacity: configLoading ? 0.6 : 1 }}
              >
                {configLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Export Settings
              </button>
              <button
                onClick={() => document.getElementById('applyr-import-settings')?.click()}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all hover:opacity-80"
                style={{ background: theme.surface2, color: theme.text, border: `1px solid ${theme.border}` }}
              >
                <Upload className="h-4 w-4" />
                Import Settings
              </button>
              <input
                id="applyr-import-settings"
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) { setImportFile(file); } }}
              />
            </div>
            {importFile && (
              <div className="mt-4 flex items-center gap-3">
                <span className="text-sm" style={{ color: theme.text2 }}>{importFile.name}</span>
                <Button variant="primary" onClick={handleImport} disabled={importing} className="text-sm">
                  {importing ? 'Importing...' : 'Import'}
                </Button>
                <button onClick={() => setImportFile(null)} className="text-sm" style={{ color: theme.text2 }}>Cancel</button>
              </div>
            )}
          </Section>

          <Section title="Full backup" subtitle="Export everything or restore from a full backup. Warning: restore will delete all existing data.">
            <div className="flex gap-3">
              <button
                onClick={handleExportFullBackup}
                disabled={fullBackupLoading}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all hover:opacity-80"
                style={{ background: theme.surface2, color: theme.text, border: `1px solid ${theme.border}`, opacity: fullBackupLoading ? 0.6 : 1 }}
              >
                {fullBackupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download Backup
              </button>
              <button
                onClick={() => document.getElementById('applyr-import-backup')?.click()}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all hover:opacity-80"
                style={{ background: theme.surface2, color: theme.text, border: `1px solid ${theme.border}` }}
              >
                <Upload className="h-4 w-4" />
                Restore Backup
              </button>
              <input
                id="applyr-import-backup"
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) { setFullImportFile(file); } }}
              />
            </div>
            {fullImportFile && (
              <div className="mt-4 p-3 rounded-lg" style={{ background: '#7f1d1d22', border: '1px solid #dc262640' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#fca5a5' }}>Warning: This will replace all data</p>
                    <p className="text-xs" style={{ color: theme.text2 }}>{fullImportFile.name}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleFullImport} disabled={fullImporting} className="px-3 py-1.5 text-sm font-semibold rounded-lg text-white" style={{ background: '#dc2626', opacity: fullImporting ? 0.6 : 1 }}>
                      {fullImporting ? 'Restoring...' : 'Restore'}
                    </button>
                    <button onClick={() => setFullImportFile(null)} className="px-3 py-1.5 text-sm font-semibold rounded-lg" style={{ background: theme.surface2, color: theme.text, border: `1px solid ${theme.border}` }}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Section>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteDocTarget}
        title="Delete document"
        message={deleteDocTarget ? `Delete "${deleteDocTarget.filename}" from your document vault?` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteDocTarget) void handleDeleteDoc(deleteDocTarget);
        }}
        onClose={() => setDeleteDocTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteSnippetTarget}
        title="Delete snippet"
        message="This writing snippet will be removed."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteSnippetTarget) void handleDeleteSnippet(deleteSnippetTarget);
        }}
        onClose={() => setDeleteSnippetTarget(null)}
      />

    </div>
  );
}
