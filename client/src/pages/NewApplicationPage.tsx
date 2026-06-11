import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Link2, FileText, Sparkles, Wand2, CheckSquare, Square, ChevronRight, ChevronLeft, Loader2, AlertCircle, Zap } from 'lucide-react';
import { extractJobInfo, createApplication, deleteApplication, getVaultDocuments, getSnippets, runStream, checkDuplicateApplication } from '@/api';
import type { VaultDocument, Snippet, DuplicateCheckResult } from '@/types';
import DuplicateWarning from '@/components/DuplicateWarning';
import FitScoreGauge from '@/components/FitScoreGauge';
import StreamingText from '@/components/StreamingText';
import MarkdownPreview from '@/components/MarkdownPreview';
import { useStream } from '@/hooks/useStream';
import { Button, Input, Select, Textarea, useToast } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTheme } from '@/contexts/ThemeContext';

type Step = 1 | 2 | 3;

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'Swedish', label: 'Swedish' },
  { value: 'Norwegian', label: 'Norwegian' },
  { value: 'Danish', label: 'Danish' },
  { value: 'Finnish', label: 'Finnish' },
  { value: 'German', label: 'German' },
  { value: 'French', label: 'French' },
  { value: 'Spanish', label: 'Spanish' },
  { value: 'Dutch', label: 'Dutch' },
  { value: 'Italian', label: 'Italian' },
  { value: 'Portuguese', label: 'Portuguese' },
  { value: 'Polish', label: 'Polish' },
];

export default function NewApplicationPage() {
  useDocumentTitle('New Application');
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const initialApplicationId = searchParams.get('applicationId');
  const initialStepParam = parseInt(searchParams.get('step') ?? '3', 10) as Step;
  const [step, setStep] = useState<Step>(() => initialApplicationId && (initialStepParam === 2 || initialStepParam === 3) ? initialStepParam : 1);

  // Step 1
  const [urlInput, setUrlInput] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [duplicate, setDuplicate] = useState<DuplicateCheckResult | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(() => initialApplicationId);
  const [creating, setCreating] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  type OneClickStage = 'idle' | 'creating' | 'analyzing' | 'generating' | 'done' | 'error';
  const [oneClickStage, setOneClickStage] = useState<OneClickStage>('idle');
  const [skipAnalysisReview, setSkipAnalysisReview] = useState(false);

  // Step 2
  const [cvDocuments, setCvDocuments] = useState<VaultDocument[]>([]);
  const [selectedCvId, setSelectedCvId] = useState('');
  const [fitScore, setFitScore] = useState<number | null>(null);
  const analyzeStream = useStream();

  // Step 3
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [checkedSnippetIds, setCheckedSnippetIds] = useState<string[]>([]);
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [language, setLanguage] = useState('en');
  const generateStream = useStream();

  useEffect(() => {
    getVaultDocuments('cv').then(cvDocs => {
      setCvDocuments(cvDocs);
      const defaultCv = cvDocs.find(d => d.is_default);
      if (defaultCv) setSelectedCvId(defaultCv.id);
      else if (cvDocs.length > 0) setSelectedCvId(cvDocs[0].id);
    }).catch(console.error);

    getSnippets().then(s => {
      setSnippets(s);
      setCheckedSnippetIds(s.filter(sn => sn.checked_by_default).map(sn => sn.id));
    }).catch(console.error);
  }, []);

  // Check for duplicates whenever company changes (debounced)
  useEffect(() => {
    if (!company.trim() || applicationId) return;
    const timer = setTimeout(() => {
      checkDuplicateApplication(company.trim(), role.trim())
        .then(dup => setDuplicate(dup.isDuplicate ? dup : null))
        .catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [company, role]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleFetch = async () => {
    if (!urlInput.trim()) return;
    setExtracting(true);
    try {
      const result = await extractJobInfo({ url: urlInput.trim() });
      setCompany(result.company);
      setRole(result.role);
      setJobDescription(result.description);
      setJobUrl(urlInput.trim());

    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to fetch job info', 'error');
    } finally {
      setExtracting(false);
    }
  };

  const handleTextExtract = () => {
    if (!jobDescription.trim()) return;
    const result = { company, role, description: jobDescription, source: 'text' };
    if (!company || !role) {
      const lines = jobDescription.split('\n').filter(l => l.trim());
      if (!company && lines[0]) setCompany(lines[0].slice(0, 60));
      if (!role && lines[1]) setRole(lines[1].slice(0, 60));
    }
    setJobDescription(result.description);
  };

  const handleProceedToStep2 = async () => {
    if (!company.trim() || !role.trim() || !jobDescription.trim()) {
      addToast('Please fill in company, role, and job description', 'error');
      return;
    }

    if (applicationId) {
      setStep(2);
      return;
    }

    setCreating(true);
    try {
      const { application, duplicate: dup } = await createApplication({
        company: company.trim(),
        role: role.trim(),
        job_url: jobUrl || undefined,
        job_description: jobDescription.trim(),
      });
      setApplicationId(application.id);
      setDuplicate(dup);
      setStep(2);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to create application', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleAbandon = async () => {
    if (!applicationId) return;
    setAbandoning(true);
    try {
      await deleteApplication(applicationId);
      navigate('/');
    } catch {
      addToast('Failed to delete application', 'error');
      setAbandoning(false);
    }
  };

  const handleOneClick = async () => {
    if (!company.trim() || !role.trim() || !jobDescription.trim() || !selectedCvId) return;
    setOneClickStage('creating');
    try {
      const { application, duplicate: dup } = await createApplication({
        company: company.trim(),
        role: role.trim(),
        job_url: jobUrl || undefined,
        job_description: jobDescription.trim(),
      });
      setApplicationId(application.id);
      setDuplicate(dup);

      setOneClickStage('analyzing');
      await runStream('/analyze', { applicationId: application.id, cvDocumentId: selectedCvId });

      setOneClickStage('generating');
      await runStream('/generate', {
        applicationId: application.id,
        cvDocumentId: selectedCvId,
        snippetIds: checkedSnippetIds,
        language,
      });

      setOneClickStage('done');
      navigate(`/history/${application.id}`);
    } catch (err) {
      setOneClickStage('error');
      addToast(err instanceof Error ? err.message : 'One-click failed', 'error');
    }
  };

  const handleAnalyze = () => {
    if (!applicationId || !selectedCvId) return;
    analyzeStream.start('/analyze', { applicationId, cvDocumentId: selectedCvId }, (payload) => {
      if (typeof payload.fitScore === 'number') setFitScore(payload.fitScore);
    });
  };

  const handleGenerate = () => {
    if (!applicationId || !selectedCvId) return;
    generateStream.start(
      '/generate',
      {
        applicationId,
        cvDocumentId: selectedCvId,
        snippetIds: checkedSnippetIds,
        additionalInstructions,
        language,
      },
      () => {
        addToast('Cover letter generated!', 'success');
      }
    );
  };

  const toggleSnippet = (id: string) => {
    setCheckedSnippetIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const stepLabels = ['Job Input', 'Fit Analysis', 'Generate'];
  const missingJobFields = [
    !company.trim() ? 'company' : '',
    !role.trim() ? 'role' : '',
    !jobDescription.trim() ? 'job description' : '',
  ].filter(Boolean);
  const canCreateApplication = missingJobFields.length === 0;
  const canAnalyzeAndGenerate = canCreateApplication && Boolean(selectedCvId);

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: theme.text }}>New Application</h1>
        <p className="text-sm mt-0.5" style={{ color: theme.text2 }}>Analyze a job fit and generate a tailored cover letter.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0 mb-8">
        {stepLabels.map((label, idx) => {
          const num = (idx + 1) as Step;
          const isActive = step === num;
          const isComplete = step > num;
          return (
            <div key={label} className="flex items-center">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  isComplete
                    ? 'bg-accent text-white'
                    : isActive
                    ? 'bg-accent text-white ring-4 ring-accent/20 dark:ring-accent/20'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}>
                  {isComplete ? '✓' : num}
                </div>
                <span className={`text-sm font-medium ${isActive ? 'text-gray-900 dark:text-gray-100' : 'hidden sm:inline text-gray-400 dark:text-gray-500'}`}>
                  {label}
                </span>
              </div>
              {idx < stepLabels.length - 1 && (
                <div className={`w-6 sm:w-12 h-0.5 mx-2 sm:mx-3 ${step > num ? 'bg-accent' : 'bg-gray-200 dark:bg-gray-700'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="space-y-6">
          {duplicate && duplicate.isDuplicate && (
            <DuplicateWarning duplicate={duplicate} />
          )}

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-accent" />
              Import from URL
            </h2>
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://jobs.example.com/posting/..."
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFetch()}
                className="flex-1" />
              <Button variant="primary"
                onClick={handleFetch}
                disabled={extracting || !urlInput.trim()}
                className="flex items-center gap-2 px-4"
              >
                {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Fetch'}
              </Button>
            </div>
          </div>

          <div className="relative flex items-center">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            <span className="px-3 text-xs text-gray-400 dark:text-gray-500 font-medium">OR</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent" />
              Paste Job Description
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">Company</label>
                <Input
                  type="text"
                  placeholder="Acme Corp"
                  value={company}
                  onChange={e => setCompany(e.target.value)} />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">Role</label>
                <Input
                  type="text"
                  placeholder="Senior Engineer"
                  value={role}
                  onChange={e => setRole(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">Job Description</label>
              <Textarea
                placeholder="Paste the full job description here..."
                value={jobDescription}
                onChange={e => setJobDescription(e.target.value)}
                onBlur={handleTextExtract}
                rows={10}
                className="font-mono text-sm resize-y" />
            </div>
          </div>

          <div className="space-y-6">
            <label className={`flex items-center justify-between w-full px-4 py-3 rounded-xl border cursor-pointer select-none transition-colors ${
              skipAnalysisReview
                ? 'border-accent dark:border-accent bg-accent/10 dark:bg-accent/20'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            } ${!canAnalyzeAndGenerate || oneClickStage !== 'idle' ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <div className="flex items-center gap-3">
                <Zap className={`w-4 h-4 flex-shrink-0 ${skipAnalysisReview ? 'text-accent' : 'text-gray-400 dark:text-gray-500'}`} />
                <div>
                  <p className={`text-sm font-medium ${skipAnalysisReview ? 'text-accent dark:text-accent' : 'text-gray-700 dark:text-gray-300'}`}>
                    Skip analysis review
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    Analyze and generate your cover letter in one step
                  </p>
                  {!selectedCvId && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Upload or select a CV in <Link to="/settings?tab=vault" className="underline font-medium">Settings</Link> to enable this.
                    </p>
                  )}
                </div>
              </div>
              <input
                type="checkbox"
                checked={skipAnalysisReview}
                onChange={e => setSkipAnalysisReview(e.target.checked)}
                disabled={!canAnalyzeAndGenerate || oneClickStage !== 'idle'}
                className="w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent/20 cursor-pointer"
              />
            </label>

            <div className="flex justify-end">
              <Button variant="primary"
                onClick={skipAnalysisReview ? handleOneClick : handleProceedToStep2}
                disabled={creating || oneClickStage !== 'idle' || !canCreateApplication || (skipAnalysisReview && !canAnalyzeAndGenerate)}
                className="flex items-center gap-2"
              >
                {(creating || oneClickStage !== 'idle') ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />
                    {oneClickStage === 'analyzing' ? 'Analyzing…' : oneClickStage === 'generating' ? 'Generating…' : 'Working…'}
                  </>
                ) : (
                  <>Analyze Fit <ChevronRight className="w-4 h-4" /></>
                )}
              </Button>
            </div>
          </div>

        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              Fit Analysis
            </h2>

            <div>
              <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">Select your CV</label>
              {cvDocuments.length === 0 ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  No CV documents found. <Link to="/settings?tab=vault" className="underline font-medium">Upload one first</Link>
                </div>
              ) : (
                <Select
                  value={selectedCvId}
                  onChange={e => setSelectedCvId(e.target.value)}>
                  {cvDocuments.map(doc => (
                    <option key={doc.id} value={doc.id}>
                      {doc.filename} {doc.is_default ? '(default)' : ''}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            {(analyzeStream.text || analyzeStream.loading) && (
              <div className="flex items-start gap-4">
                {fitScore !== null && <FitScoreGauge score={fitScore} />}
                <div className={`flex-1 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4 ${analyzeStream.done ? '' : 'max-h-96 overflow-y-auto'}`}>
                  {analyzeStream.done
                    ? <MarkdownPreview content={analyzeStream.text} />
                    : <StreamingText text={analyzeStream.text} done={analyzeStream.done} />
                  }
                </div>
              </div>
            )}

            {analyzeStream.error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                {analyzeStream.error}
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <Button onClick={() => setStep(1)} className="flex items-center gap-2">
                <ChevronLeft className="w-4 h-4" /> Back
              </Button>
              {analyzeStream.done && (
                <Button
                  onClick={handleAbandon}
                  disabled={abandoning}
                  className="flex items-center gap-2 text-red-500 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  {abandoning ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Abandon
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {!analyzeStream.loading && !analyzeStream.done && (
                <Button onClick={() => setStep(3)}>
                  Skip
                </Button>
              )}
              {analyzeStream.done ? (
                <Button variant="primary" onClick={() => setStep(3)} className="flex items-center gap-2">
                  Continue <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button variant="primary"
                  onClick={handleAnalyze}
                  disabled={!selectedCvId || analyzeStream.loading}
                  className="flex items-center gap-2"
                >
                  {analyzeStream.loading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Sparkles className="w-4 h-4" />}
                  Analyze Fit
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-accent" />
              Generate Cover Letter
            </h2>

            {snippets.length > 0 && (
              <div>
                <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">Include Snippets</label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {snippets.map(s => (
                    <label key={s.id} className="flex items-start gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg p-2 transition-colors">
                      <button
                        type="button"
                        onClick={() => toggleSnippet(s.id)}
                        className="mt-0.5 flex-shrink-0"
                      >
                        {checkedSnippetIds.includes(s.id)
                          ? <CheckSquare className="w-5 h-5 text-accent" />
                          : <Square className="w-5 h-5 text-gray-400" />
                        }
                      </button>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{s.content}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="w-48">
              <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">Language</label>
              <Select value={language} onChange={e => setLanguage(e.target.value)}>
                {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </Select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider font-semibold text-text2 mb-1">Additional Instructions (optional)</label>
              <Textarea
                placeholder="Emphasize leadership experience, mention the company's recent Series B, etc."
                value={additionalInstructions}
                onChange={e => setAdditionalInstructions(e.target.value)}
                rows={3}
                className="resize-y" />
            </div>

            {(generateStream.text || generateStream.loading) && (
              <div className={`bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4 ${generateStream.done ? '' : 'max-h-96 overflow-y-auto'}`}>
                {generateStream.done
                  ? <MarkdownPreview content={generateStream.text} />
                  : <StreamingText text={generateStream.text} done={generateStream.done} />
                }
              </div>
            )}

            {generateStream.error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                {generateStream.error}
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <Button onClick={() => setStep(2)} className="flex items-center gap-2">
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>
            {generateStream.done && applicationId ? (
              <Button variant="primary"
                onClick={() => navigate(`/history/${applicationId}`)}
                className="flex items-center gap-2">
                View Application <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button variant="primary"
                onClick={handleGenerate}
                disabled={!selectedCvId || generateStream.loading}
                className="flex items-center gap-2"
              >
                {generateStream.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                Generate Cover Letter
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
