import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-xl border border-red-200 dark:border-red-900 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Something went wrong
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                The app hit an unexpected error. You can try again, or reload the page.
              </p>
              <pre className="mt-3 p-3 rounded-md bg-gray-100 dark:bg-gray-900 text-xs text-gray-700 dark:text-gray-300 overflow-auto max-h-40 whitespace-pre-wrap break-words">
                {this.state.error.message || String(this.state.error)}
              </pre>
              <div className="flex gap-2 mt-4">
                <button onClick={this.handleReset} className="btn-secondary text-sm">
                  Try again
                </button>
                <button onClick={this.handleReload} className="btn-primary text-sm flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" /> Reload
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
