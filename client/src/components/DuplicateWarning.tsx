import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, X, ExternalLink } from 'lucide-react';
import type { DuplicateCheckResult } from '@/types';
import StatusBadge from '@/components/StatusBadge';

interface Props {
  duplicate: DuplicateCheckResult;
  onDismiss?: () => void;
}

export default function DuplicateWarning({ duplicate, onDismiss }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (!duplicate.isDuplicate || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  const hasExact = duplicate.matches.some(m => m.exactMatch);
  const color = hasExact
    ? { border: 'border-red-200 dark:border-red-800', bg: 'bg-red-50 dark:bg-red-900/20', icon: 'text-red-600 dark:text-red-400', title: 'text-red-800 dark:text-red-300', body: 'text-red-700 dark:text-red-400', muted: 'text-red-500 dark:text-red-500', hover: 'hover:bg-red-100 dark:hover:bg-red-800' }
    : { border: 'border-yellow-200 dark:border-yellow-800', bg: 'bg-yellow-50 dark:bg-yellow-900/20', icon: 'text-yellow-600 dark:text-yellow-400', title: 'text-yellow-800 dark:text-yellow-300', body: 'text-yellow-700 dark:text-yellow-400', muted: 'text-yellow-600 dark:text-yellow-500', hover: 'hover:bg-yellow-100 dark:hover:bg-yellow-800' };

  return (
    <div className={`rounded-xl border ${color.border} ${color.bg} p-4`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`w-5 h-5 ${color.icon} flex-shrink-0 mt-0.5`} />
        <div className="flex-1">
          <h4 className={`text-sm font-semibold ${color.title}`}>
            {hasExact ? 'Already Applied' : 'Previously Applied to This Company'}
          </h4>
          <p className={`text-sm ${color.body} mt-0.5`}>
            {hasExact
              ? 'You have already applied to this exact role:'
              : 'You have previous applications at this company:'}
          </p>
          <ul className="mt-2 space-y-1">
            {duplicate.matches.map(match => (
              <li key={match.id} className="flex items-center gap-2 text-sm">
                <Link
                  to={`/history/${match.id}`}
                  className={`${color.title} hover:underline font-medium flex items-center gap-1`}
                >
                  {match.company} — {match.role}
                  <ExternalLink className="w-3 h-3" />
                </Link>
                <StatusBadge status={match.status} />
                <span className={`${color.muted} text-xs`}>
                  {new Date(match.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
          {duplicate.totalMatches !== undefined && duplicate.totalMatches > duplicate.matches.length && (
            <p className={`text-xs ${color.muted} mt-2`}>
              + {duplicate.totalMatches - duplicate.matches.length} more in history
            </p>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className={`p-1 rounded ${color.hover} transition-colors`}
        >
          <X className={`w-4 h-4 ${color.icon}`} />
        </button>
      </div>
    </div>
  );
}
