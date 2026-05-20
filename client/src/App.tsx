import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { ThemeProvider } from '@/contexts/ThemeContext';
import SettingsProvider from '@/contexts/SettingsContext';
import { ToastProvider } from '@/components/ui';

import ErrorBoundary from '@/components/ErrorBoundary';
import Layout from '@/components/Layout';
import FrontPage from '@/pages/FrontPage';
import NewApplicationPage from '@/pages/NewApplicationPage';
import HistoryPage from '@/pages/HistoryPage';
import ApplicationDetailPage from '@/pages/ApplicationDetailPage';
import SettingsPage from '@/pages/SettingsPage';
import DonatePage from '@/pages/DonatePage';
import AnalysisPage from '@/pages/AnalysisPage';

export default function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
      <SettingsProvider>
        <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<FrontPage />} />
              <Route path="/apply" element={<NewApplicationPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/history/:id" element={<ApplicationDetailPage />} />
              <Route path="/applications" element={<Navigate to="/history" replace />} />
              <Route path="/analytics" element={<Navigate to="/" replace />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/analysis" element={<AnalysisPage />} />
              <Route path="/analyze-cv" element={<Navigate to="/analysis" replace />} />
              <Route path="/donate" element={<DonatePage />} />
              {/* Redirect old routes to settings */}
              <Route path="/vault" element={<Navigate to="/settings?tab=vault" replace />} />
              <Route path="/snippets" element={<Navigate to="/settings?tab=prompt" replace />} />
              <Route path="/transfer" element={<Navigate to="/settings?tab=data" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
        </ToastProvider>
      </SettingsProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}
