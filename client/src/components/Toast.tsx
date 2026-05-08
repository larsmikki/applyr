import { useEffect } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import type { Toast as ToastType } from '@/hooks/useToast';

interface ToastItemProps {
  toast: ToastType;
  onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  const config = {
    success: {
      icon: CheckCircle,
      classes: 'bg-green-50 dark:bg-green-900/50 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
      iconClass: 'text-green-500',
    },
    error: {
      icon: XCircle,
      classes: 'bg-red-50 dark:bg-red-900/50 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
      iconClass: 'text-red-500',
    },
    info: {
      icon: Info,
      classes: 'bg-blue-50 dark:bg-blue-900/50 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
      iconClass: 'text-blue-500',
    },
  }[toast.type];

  const Icon = config.icon;

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border shadow-lg max-w-sm w-full ${config.classes} animate-in slide-in-from-right-2`}>
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${config.iconClass}`} />
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        className="p-0.5 rounded hover:opacity-70 transition-opacity flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

interface ToastStackProps {
  toasts: ToastType[];
  onRemove: (id: string) => void;
}

export default function ToastStack({ toasts, onRemove }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}
