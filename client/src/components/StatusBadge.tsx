type Status = 'draft' | 'applied' | 'interview' | 'offer' | 'rejected' | 'withdrawn';

const statusConfig: Record<Status, { label: string; classes: string }> = {
  draft: { label: 'Draft', classes: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  applied: { label: 'Applied', classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' },
  interview: { label: 'Interview', classes: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300' },
  offer: { label: 'Offer', classes: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' },
  rejected: { label: 'Rejected', classes: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' },
  withdrawn: { label: 'Withdrawn', classes: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
};

interface Props {
  status: Status | string;
  className?: string;
  grey?: boolean;
}

export default function StatusBadge({ status, className = '', grey = false }: Props) {
  const config = statusConfig[status as Status] || { label: status, classes: 'bg-gray-100 text-gray-600' };
  const classes = grey
    ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
    : config.classes;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${classes} ${className}`}>
      {config.label}
    </span>
  );
}
