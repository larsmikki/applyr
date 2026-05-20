import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { PlusCircle, ArrowRight, AlertCircle, Play } from 'lucide-react';
import { getApplications, getAnalyticsSummary, getAnalyticsTrends, getAnalyticsCompanies } from '@/api';
import type { Application, AnalyticsSummary } from '@/types';
import FitScoreRing from '@/components/FitScoreRing';
import { Button } from '@/components/ui';

function StatCard({ label, value }: {
  label: string;
  value: number;
}) {
  return (
    <div className="relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: 'linear-gradient(to bottom, #a855f7, #ec4899)' }} />
      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2 pl-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 pl-1">{value}</p>
    </div>
  );
}

function companyColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `oklch(0.55 0.14 ${hue})`;
}

function CompanyMark({ company, size = 36 }: { company: string; size?: number }) {
  return (
    <div
      className="rounded-lg flex items-center justify-center flex-shrink-0 text-white font-semibold"
      style={{ width: size, height: size, background: companyColor(company), fontSize: Math.round(size * 0.42) }}
    >
      {company.charAt(0).toUpperCase()}
    </div>
  );
}

const PIPELINE_STAGES = ['draft', 'applied', 'interview', 'offer'] as const;
const STAGE_LABELS: Record<string, string> = { draft: 'Draft', applied: 'Applied', interview: 'Interview', offer: 'Offer' };
const STAGE_COLORS: Record<string, string> = {
  draft: '#9ca3af',
  applied: '#3b82f6',
  interview: '#a855f7',
  offer: '#22c55e',
  rejected: '#dc2626',
  withdrawn: '#6b7280',
};

function PipelineFunnel({ byStatus }: { byStatus: Record<string, number> }) {
  const counts = PIPELINE_STAGES.map(s => ({ stage: s, count: byStatus[s] || 0 }));
  const max = Math.max(...counts.map(c => c.count), 1);

  return (
    <div className="space-y-3 mt-4">
      {counts.map(({ stage, count }) => {
        const pct = (count / max) * 100;
        return (
          <div key={stage} className="grid items-center gap-3" style={{ gridTemplateColumns: '80px 1fr 32px' }}>
            <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">{STAGE_LABELS[stage]}</span>
            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: STAGE_COLORS[stage] }}
              />
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 text-right tabular-nums">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function SectionLabel({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <div className="flex items-center gap-2.5 mb-1">
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
      {action}
    </div>
  );
}

function AppRow({ app }: { app: Application }) {
  return (
    <Link
      to={`/history/${app.id}`}
      className="flex items-center gap-3 px-6 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
    >
      <CompanyMark company={app.company} size={36} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{app.company}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{app.role}</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {app.fit_score !== undefined && app.fit_score !== null && (
          <FitScoreRing score={app.fit_score} size={32} />
        )}
        <span className="text-xs text-gray-400 dark:text-gray-500 w-20 text-right">
          {new Date(app.created_at).toLocaleDateString()}
        </span>
      </div>
    </Link>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function weekLabel(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  return `Week ${week} · ${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`;
}

export default function FrontPage() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [recentApps, setRecentApps] = useState<Application[]>([]);
  const [inProgressApps, setInProgressApps] = useState<Application[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [companies, setCompanies] = useState<{ company: string; count: number; latestStatus: string }[]>([]);
  const [avgPerWeek, setAvgPerWeek] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(false);
    Promise.all([
      getApplications({ limit: '5', sort: 'created_at_desc' }),
      getApplications({ status: 'interview', sort: 'created_at_desc' }),
      getApplications({ status: 'offer', sort: 'created_at_desc' }),
      getAnalyticsSummary(),
      getAnalyticsTrends(),
      getAnalyticsCompanies(),
    ]).then(([appsData, interviewData, offerData, summaryData, trendsData, companiesData]) => {
      setRecentApps(appsData.data);
      const merged = [...interviewData.data, ...offerData.data].sort((a, b) => b.created_at - a.created_at);
      setInProgressApps(merged);
      setSummary(summaryData);
      setCompanies(companiesData.slice(0, 5));
      const last7 = trendsData.daily.slice(-7);
      setAvgPerWeek(last7.reduce((sum, d) => sum + d.count, 0));
    }).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-4">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-gray-600 dark:text-gray-400 font-medium">Failed to load dashboard data</p>
        <Button onClick={loadData} className="flex items-center gap-2">
          <Play className="w-4 h-4" /> Retry
        </Button>
      </div>
    );
  }

  const orphanApps = recentApps.filter(
    app => app.status === 'draft' && !app.output_path && app.created_at < Date.now() - 300000
  );

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-medium mb-1">{weekLabel()}</p>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: theme.text }}>{greeting()}.</h1>
          {summary && (
            <p className="text-sm mt-0.5" style={{ color: theme.text2 }}>
              You have <strong className="text-gray-700 dark:text-gray-300">{inProgressApps.length} conversation{inProgressApps.length !== 1 ? 's' : ''}</strong> in progress
              {(summary.byStatus['offer'] || 0) > 0 && (
                <> and <strong className="text-gray-700 dark:text-gray-300">{summary.byStatus['offer']} open offer{summary.byStatus['offer'] !== 1 ? 's' : ''}</strong></>
              )}.
            </p>
          )}
        </div>
        <Button variant="primary" onClick={() => navigate('/apply')} className="flex items-center gap-2">
          <PlusCircle className="w-4 h-4" />
          New Application
        </Button>
      </div>

      {orphanApps.length > 0 && (
        <div className="mb-6 p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-amber-800 dark:text-amber-300 text-sm">Incomplete applications</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">These started but didn't finish generating a cover letter.</p>
              <div className="mt-2 space-y-1">
                {orphanApps.map(app => (
                  <div key={app.id} className="flex items-center gap-3">
                    <span className="text-sm text-amber-800 dark:text-amber-300 truncate">{app.company} — {app.role}</span>
                    <Link
                      to={`/apply?applicationId=${app.id}&step=2`}
                      className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline flex-shrink-0"
                    >
                      Resume →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total applications" value={summary?.total || 0} />
        <StatCard label="Avg per week" value={avgPerWeek} />
        <StatCard label="Avg fit score" value={summary?.averageFitScore || 0} />
        <StatCard label="This month" value={summary?.totalThisMonth || 0} />
      </div>

      {/* Pipeline + Where you're applying */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {summary && (
          <div>
            <SectionLabel title="Pipeline" />
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mt-3">
              <PipelineFunnel byStatus={summary.byStatus} />
            </div>
          </div>
        )}

        {companies.length > 0 && (
          <div>
            <SectionLabel title="Where you're applying" />
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mt-3">
              <div className="space-y-2">
                {companies.map(({ company, count, latestStatus }) => {
                  const max = companies[0].count;
                  const dotColor = STAGE_COLORS[latestStatus] || '#9ca3af';
                  return (
                    <div key={company} className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 dark:text-gray-300 w-32 truncate flex-shrink-0 flex items-center gap-1.5">
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: dotColor }}
                          title={`Latest: ${latestStatus}`}
                        />
                        {company}
                      </span>
                      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="h-2 rounded-full"
                          style={{ width: `${(count / max) * 100}%`, background: companyColor(company) }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-4 text-right flex-shrink-0">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* In progress */}
      {inProgressApps.length > 0 && (
        <div className="mb-6">
          <SectionLabel title="In progress" count={inProgressApps.length} />
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mt-3">
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {inProgressApps.map(app => <li key={app.id}><AppRow app={app} /></li>)}
            </ul>
          </div>
        </div>
      )}

      {/* Recent */}
      <div>
        <SectionLabel
          title="Recent"
          count={recentApps.length}
          action={
            <Link
              to="/history"
              className="text-xs font-medium flex items-center gap-1 whitespace-nowrap"
              style={{ color: 'var(--theme-accent, #a855f7)' }}
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          }
        />
        {recentApps.length === 0 ? (
          <div className="mt-3 p-12 text-center rounded-xl border border-gray-200 dark:border-gray-700">
            <p className="text-gray-500 dark:text-gray-400 font-medium">No applications yet</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Start tracking your job search</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mt-3">
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {recentApps.map(app => <li key={app.id}><AppRow app={app} /></li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
