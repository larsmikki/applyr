import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { Briefcase, Search, ChevronLeft, ChevronRight, Calendar, PlusCircle } from 'lucide-react';
import { getApplications } from '@/api';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { Application, Pagination } from '@/types';
import StatusBadge from '@/components/StatusBadge';
import FitScoreRing from '@/components/FitScoreRing';
import { Button, Input, Select } from '@/components/ui';

function SectionLabel({ title, count }: { title: string; count?: number }) {
  const { theme } = useTheme();
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="text-xs font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: theme.text2 }}>{title}</span>
      {count !== undefined && (
        <span
          className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold"
          style={{ background: `${theme.accent}20`, color: theme.accent }}
        >
          {count}
        </span>
      )}
      <div className="flex-1 h-px" style={{ background: theme.border }} />
    </div>
  );
}

const STATUSES = ['all', 'draft', 'applied', 'interview', 'offer', 'rejected', 'withdrawn'];

function companyColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `oklch(0.55 0.14 ${Math.abs(hash) % 360})`;
}

function CompanyMark({ company }: { company: string }) {
  return (
    <div
      className="rounded-lg flex items-center justify-center flex-shrink-0 text-white font-semibold"
      style={{ width: 36, height: 36, background: companyColor(company), fontSize: 15 }}
    >
      {company.charAt(0).toUpperCase()}
    </div>
  );
}

export default function HistoryPage() {
  useDocumentTitle('History');
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [applications, setApplications] = useState<Application[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(() => searchParams.get('filter') || 'all');
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get('q') || '');
  const [sort, setSort] = useState(() => searchParams.get('sort') || 'created_at_desc');
  const [page, setPage] = useState(() => parseInt(searchParams.get('page') || '1', 10) || 1);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  // Mirror filter state into the URL so navigating away and back restores it.
  useEffect(() => {
    const next = new URLSearchParams();
    if (filter !== 'all') next.set('filter', filter);
    if (debouncedSearch.trim()) next.set('q', debouncedSearch.trim());
    if (sort !== 'created_at_desc') next.set('sort', sort);
    if (page !== 1) next.set('page', String(page));
    setSearchParams(next, { replace: true });
  }, [filter, debouncedSearch, sort, page, setSearchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: '17',
        sort,
      };
      if (filter !== 'all') params.status = filter;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

      const result = await getApplications(params);
      setApplications(result.data);
      setPagination(result.pagination);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedSearch, sort, page]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    queueMicrotask(() => setPage(1));
  }, [debouncedSearch, filter, sort]);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-extrabold tracking-tight mb-6" style={{ color: theme.text }}>History</h1>
      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6 space-y-3">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === s
                  ? 'bg-accent text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search company or role..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9" />
          </div>
          <Select value={sort} onChange={e => setSort(e.target.value)} className="w-48">
            <option value="created_at_desc">Newest first</option>
            <option value="created_at_asc">Oldest first</option>
            <option value="company_asc">Company A-Z</option>
            <option value="updated_at_desc">Recently updated</option>
          </Select>
        </div>
      </div>

      {/* List */}
      <SectionLabel title="History" count={pagination?.total} />

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : applications.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-16 text-center">
          <Briefcase className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No applications found</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            {filter !== 'all' || search ? 'Try adjusting your filters' : 'Start by creating your first application'}
          </p>
          {!filter && !search && (
            <Button variant="primary" onClick={() => navigate('/apply')} className="inline-flex items-center gap-2 mt-4">
              <PlusCircle className="w-4 h-4" />
              New Cover Letter
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {applications.map(app => (
              <li key={app.id}>
                <Link
                  to={`/history/${app.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <CompanyMark company={app.company} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{app.company}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{app.role}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <StatusBadge status={app.status} className="w-20 justify-center" />
                    {app.fit_score !== undefined && app.fit_score !== null && (
                      <FitScoreRing score={app.fit_score} size={32} />
                    )}
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 w-24 justify-end">
                      <Calendar className="w-3 h-3" />
                      {new Date(app.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 text-sm">
              <ChevronLeft className="w-3 h-3" /> Prev
            </Button>
            <Button
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={page>= pagination.totalPages}
              className="flex items-center gap-1 text-sm"
            >
              Next <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
