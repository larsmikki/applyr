export interface Application {
  id: string;
  company: string;
  role: string;
  job_url?: string;
  job_description: string;
  status: 'draft' | 'applied' | 'interview' | 'offer' | 'rejected' | 'withdrawn';
  fit_score?: number;
  fit_analysis?: string;
  output_path?: string;
  applied_at?: number;
  notes?: string;
  created_at: number;
  updated_at: number;
}

export interface ApplicationNote {
  id: string;
  application_id: string;
  headline: string;
  body: string;
  created_at: number;
  updated_at: number;
}

export interface GenerationLog {
  id: string;
  application_id: string;
  version: number;
  prompt_summary?: string;
  response: string;
  model: string;
  tokens_used?: number;
  filename: string;
  created_at: number;
}

export interface VaultDocument {
  id: string;
  label: string;
  filename: string;
  stored_name: string;
  mime_type: string;
  size_bytes: number;
  doc_type: 'cv' | 'cover_letter' | 'portfolio' | 'other' | 'cover_letter_template' | 'attachment';
  extracted_text?: string;
  is_default: number;
  created_at: number;
  updated_at: number;
}

export interface Snippet {
  id: string;
  title: string;
  content: string;
  checked_by_default: number;
  hidden: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface Settings {
  ai_provider: string;
  ai_model: string;
  ai_api_key: string;
  ai_base_url: string;
  ai_ollama_url?: string;
  ai_temperature?: string;
  tone?: string;
  length?: string;
  structure?: string;
  output_dir: string;
  pin_enabled: string;
  theme: string;
  output_language: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  hasChildren: boolean;
}

export interface BrowseResult {
  currentPath: string;
  parent: string | null;
  directories: DirectoryEntry[];
}

export interface AnalyticsSummary {
  total: number;
  byStatus: Record<string, number>;
  responseRate: number;
  averageFitScore: number;
  totalThisMonth: number;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matches: (Pick<Application, 'id' | 'company' | 'role' | 'status' | 'created_at'> & { exactMatch: boolean })[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface InterviewPrepQuestion {
  question: string;
  talking_points: string[];
}

export interface InterviewPrepQuestionToAsk {
  question: string;
  purpose: string;
}

export interface InterviewPrep {
  application_id: string;
  questions: InterviewPrepQuestion[];
  questions_to_ask: InterviewPrepQuestionToAsk[];
  user_notes?: string | null;
  model: string;
  created_at: number;
  updated_at: number;
}

export interface CVReview {
  id: string;
  cv_document_id: string;
  content: string;
  score: number | null;
  rewritten_cv: string | null;
  rewrite_review: string | null;
  rewrite_score: number | null;
  created_at: number;
}

export interface PromptsResponse {
  prompts: Record<string, string>;
  customized: string[];
}
