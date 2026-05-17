import type { Application, ApplicationNote, VaultDocument, Snippet, Settings, AnalyticsSummary, DuplicateCheckResult, GenerationLog, Pagination, InterviewPrep, CVReview, PromptsResponse, BrowseResult } from '@/types';

const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('applyr_token');
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      errMsg = data.error || errMsg;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  return res.json() as Promise<T>;
}

// Settings
export const getSettings = () => request<Settings>('/settings');
export const getLocalModels = () =>
  request<{ models: string[]; error?: string; message?: string }>('/settings/local-models');
export const updateSettings = (data: Partial<Settings>) =>
  request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(data) });
export const getApiKeyStatus = () => request<{ configured: boolean }>('/settings/api-key-status');
export const getPrompts = () => request<PromptsResponse>('/settings/prompts');
export const updatePrompt = (key: string, text: string) =>
  request<{ success: boolean }>(`/settings/prompts/${key}`, { method: 'PUT', body: JSON.stringify({ text }) });
export const resetPrompt = (key: string) =>
  request<{ success: boolean }>(`/settings/prompts/${key}`, { method: 'DELETE' });
export const browseDir = (path?: string) => {
  const qs = path ? `?path=${encodeURIComponent(path)}` : '';
  return request<BrowseResult>(`/settings/browse${qs}`);
};
export const getBestPractices = () => request<{ content: string }>('/best-practices');
export const updateBestPractices = (content: string) =>
  request<{ success: boolean }>('/best-practices', { method: 'PUT', body: JSON.stringify({ content }) });

// Vault
export const getVaultDocuments = (docType?: string) =>
  request<VaultDocument[]>(docType ? `/vault?doc_type=${encodeURIComponent(docType)}` : '/vault');
export const uploadDocument = (formData: FormData) => {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${BASE}/vault`, { method: 'POST', headers, body: formData })
    .then(async res => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      return res.json() as Promise<VaultDocument>;
    });
};
export const updateDocument = (id: string, data: Partial<VaultDocument>) =>
  request<VaultDocument>(`/vault/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteDocument = (id: string) =>
  request<{ success: boolean }>(`/vault/${id}`, { method: 'DELETE' });
export const getVaultDocumentText = (id: string) =>
  request<{ text: string }>(`/vault/${id}/text`);
// Snippets
export const getSnippets = () => request<Snippet[]>('/snippets');
export const createSnippet = (data: Partial<Snippet>) =>
  request<Snippet>('/snippets', { method: 'POST', body: JSON.stringify(data) });
export const updateSnippet = (id: string, data: Partial<Snippet>) =>
  request<Snippet>(`/snippets/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteSnippet = (id: string) =>
  request<{ success: boolean }>(`/snippets/${id}`, { method: 'DELETE' });
// Applications
export const getApplications = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return request<{ data: Application[]; pagination: Pagination }>(`/jobs${qs}`);
};
export const checkDuplicateApplication = (company: string, role: string) =>
  request<DuplicateCheckResult>(`/jobs/duplicate-check?company=${encodeURIComponent(company)}&role=${encodeURIComponent(role)}`);

export const createApplication = (data: Partial<Application>) =>
  request<{ application: Application; duplicate: DuplicateCheckResult }>('/jobs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
export const getApplication = (id: string) =>
  request<{ application: Application }>(`/jobs/${id}`);
export const updateApplication = (id: string, data: Partial<Application>) =>
  request<Application>(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteApplication = (id: string, deleteFolder = true) =>
  request<{ success: boolean }>(`/jobs/${id}?deleteFolder=${deleteFolder}`, { method: 'DELETE' });
export const getApplicationVersions = (id: string) =>
  request<GenerationLog[]>(`/jobs/${id}/versions`);
export const regenerateOdt = (id: string) =>
  request<{ success: boolean; odtFile: string; pdfFile: string }>(`/jobs/${id}/regenerate-odt`, { method: 'POST' });

// Application Notes
export const getApplicationNotes = (id: string) =>
  request<ApplicationNote[]>(`/jobs/${id}/notes`);
export const createApplicationNote = (id: string, data: { headline: string; body: string }) =>
  request<ApplicationNote>(`/jobs/${id}/notes`, { method: 'POST', body: JSON.stringify(data) });
export const updateApplicationNote = (id: string, noteId: string, data: { headline?: string; body?: string }) =>
  request<ApplicationNote>(`/jobs/${id}/notes/${noteId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteApplicationNote = (id: string, noteId: string) =>
  request<{ success: boolean }>(`/jobs/${id}/notes/${noteId}`, { method: 'DELETE' });

// Extract
export const extractJobInfo = (data: { url?: string; text?: string }) =>
  request<{ company: string; role: string; description: string; source: string }>('/extract', {
    method: 'POST',
    body: JSON.stringify(data),
  });

// Analytics
export const getAnalyticsSummary = () => request<AnalyticsSummary>('/analytics/summary');
export const getAnalyticsTrends = () => request<{ daily: { date: string; count: number }[] }>('/analytics/trends');
export const getAnalyticsCompanies = () => request<{ company: string; count: number; latestStatus: string }[]>('/analytics/companies');

// Export / Import
export const exportCSV = async (): Promise<string> => {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/export/csv`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
};
export const exportConfig = () => request<{ settings: Partial<Settings>; snippets: Snippet[] }>('/config/export');
export const importConfig = (data: { settings?: Partial<Settings>; snippets?: Snippet[] }) =>
  request<{ success: boolean; settingsUpdated: number; snippetsImported: number }>('/config/import', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const exportFullBackup = async (): Promise<string> => {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/export/full`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
};
export const importFullBackup = (data: unknown) =>
  request<{ success: boolean; restored: Record<string, number> }>('/import/full', {
    method: 'POST',
    body: JSON.stringify(data),
  });

// Interview Prep
export const getInterviewPrep = (applicationId: string) =>
  request<InterviewPrep>(`/interview-prep/${applicationId}`);
export const generateInterviewPrep = (applicationId: string, cvDocumentId?: string, signal?: AbortSignal) =>
  streamRequest('/interview-prep/generate', { applicationId, cvDocumentId }, signal);
export const updateInterviewPrepNotes = (applicationId: string, user_notes: string) =>
  request<{ success: boolean }>(`/interview-prep/${applicationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ user_notes }),
  });

// CV Review
export const getCVReviewsByDoc = (docId: string) => request<CVReview[]>(`/analyze-cv/doc/${docId}`);
export const deleteCVReview = (id: string) => request<{ success: boolean }>(`/analyze-cv/${id}`, { method: 'DELETE' });
export const patchCVRewriteResult = (id: string, data: { rewrittenCV: string; rewriteReview: string; rewriteScore: number | null }) =>
  request<{ success: boolean }>(`/analyze-cv/${id}/rewrite`, { method: 'PATCH', body: JSON.stringify(data) });
export const streamRewriteCV = (
  cvDocumentId: string,
  reviewText: string,
  maxIterations: number,
  targetRoles: string[],
  targetDepartments: string[] = [],
  signal?: AbortSignal
) =>
  streamRequest('/rewrite-cv', { cvDocumentId, reviewText, maxIterations, targetRoles, targetDepartments }, signal);
export const getRecentApplicationRoles = () => request<string[]>('/jobs/roles');

export const streamGapAnalysis = (signal?: AbortSignal) =>
  streamRequest('/gap-analysis', {}, signal);
export const saveCareerGuidance = (content: string) =>
  request<{ id: string }>('/career-guidance/save', { method: 'POST', body: JSON.stringify({ content }) });
export const getCareerGuidanceHistory = () =>
  request<{ id: string; content: string; created_at: number }[]>('/career-guidance/history');
export const deleteCareerGuidance = (id: string) =>
  request<{ success: boolean }>(`/career-guidance/${id}`, { method: 'DELETE' });
export const saveGapAnalysis = (content: string) =>
  request<{ id: string }>('/gap-analysis/save', { method: 'POST', body: JSON.stringify({ content }) });
export const getGapAnalysisHistory = () =>
  request<{ id: string; content: string; created_at: number }[]>('/gap-analysis/history');
export const deleteGapAnalysis = (id: string) =>
  request<{ success: boolean }>(`/gap-analysis/${id}`, { method: 'DELETE' });

// Streaming helper - returns fetch response for streaming
export function streamRequest(path: string, body: object, signal?: AbortSignal): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });
}

/** Consumes an SSE stream to completion and resolves with the final `done` payload. */
export async function runStream(path: string, body: object): Promise<Record<string, unknown>> {
  const res = await streamRequest(path, body);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalPayload: Record<string, unknown> = {};

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
        if (payload.done) finalPayload = payload;
      } catch { /* ignore malformed */ }
    }
  }

  return finalPayload;
}
