import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import Footer from '@/components/Footer';

// Outline SVG icons for the fleet top navigation.
const PlusCircleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM12 8.75v6.5M8.75 12h6.5" />
  </svg>
);


const SettingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.063.379.32.696.673.846.084.036.167.074.249.115.343.17.75.146 1.071-.064l.758-.493a1.125 1.125 0 0 1 1.43.139l.773.772c.389.389.447.998.139 1.431l-.493.758c-.21.321-.234.728-.064 1.071.041.082.079.165.115.249.15.353.467.61.846.673l.894.149c.542.09.94.56.94 1.11v1.093c0 .55-.398 1.02-.94 1.11l-.894.149c-.379.063-.696.32-.846.673a6.91 6.91 0 0 1-.115.249c-.17.343-.146.75.064 1.071l.493.758c.308.433.25 1.042-.139 1.431l-.773.772a1.125 1.125 0 0 1-1.43.139l-.758-.493c-.321-.21-.728-.234-1.071-.064a6.91 6.91 0 0 1-.249.115c-.353.15-.61.467-.673.846l-.149.894c-.09.542-.56.94-1.11.94h-1.093c-.55 0-1.02-.398-1.11-.94l-.149-.894a1.125 1.125 0 0 0-.673-.846 6.91 6.91 0 0 1-.249-.115c-.343-.17-.75-.146-1.071.064l-.758.493a1.125 1.125 0 0 1-1.43-.139l-.773-.772a1.125 1.125 0 0 1-.139-1.431l.493-.758c.21-.321.234-.728.064-1.071a6.91 6.91 0 0 1-.115-.249 1.125 1.125 0 0 0-.846-.673l-.894-.149A1.125 1.125 0 0 1 3 12.674v-1.093c0-.55.398-1.02.94-1.11l.894-.149c.379-.063.696-.32.846-.673.036-.084.074-.167.115-.249.17-.343.146-.75-.064-1.071l-.493-.758a1.125 1.125 0 0 1 .139-1.431l.773-.772a1.125 1.125 0 0 1 1.43-.139l.758.493c.321.21.728.234 1.071.064.082-.041.165-.079.249-.115.353-.15.61-.467.673-.846l.149-.894z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
  </svg>
);

const AnalyzeCVIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-6a2.25 2.25 0 0 0-.659-1.591l-3.5-3.5A2.25 2.25 0 0 0 13.75 2.5H6.75A2.25 2.25 0 0 0 4.5 4.75v14.5a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-5z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 2.75V7a1.5 1.5 0 0 0 1.5 1.5h4.25M8 12.5h8M8 16h5.5" />
  </svg>
);

const HomeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955a1.125 1.125 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-6.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
  </svg>
);

const ApplicationsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75V5.25A2.25 2.25 0 0 1 10.5 3h3a2.25 2.25 0 0 1 2.25 2.25v1.5M4.5 9A2.25 2.25 0 0 1 6.75 6.75h10.5A2.25 2.25 0 0 1 19.5 9v8.25a2.25 2.25 0 0 1-2.25 2.25H6.75a2.25 2.25 0 0 1-2.25-2.25V9z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6" />
  </svg>
);

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: <HomeIcon />, end: true },
  { to: '/apply', label: 'New Application', icon: <PlusCircleIcon />, end: false },
  { to: '/history', label: 'History', icon: <ApplicationsIcon />, end: false },
  { to: '/analysis', label: 'Analysis', icon: <AnalyzeCVIcon />, end: false },
  { to: '/settings', label: 'Settings', icon: <SettingsIcon />, end: false },
];

export default function Layout() {
  const { theme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: theme.bg, color: theme.text }}>
      {/* Skip-to-content: visible only when focused via keyboard. Lets users
          bypass the nav on every page load. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded-lg focus:bg-accent focus:text-white focus:shadow-lg"
      >
        Skip to main content
      </a>
      {/* Sticky header */}
      <header
        className="sticky top-0 z-40 backdrop-blur-md"
        style={{
          background: `${theme.surface}dd`,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Applyr — go to dashboard"
            className="flex items-center gap-2.5 rounded-lg p-1 -ml-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 focus-visible:ring-offset-2"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <img src="/favicon.svg" width={28} height={28} alt="" className="shrink-0" />
            <span className="text-xl font-extrabold tracking-tight gradient-text select-none">Applyr</span>
          </button>

          {/* Nav */}
          <nav className="flex items-center gap-0.5" aria-label="Primary">
            {NAV_ITEMS.map(({ to, label, icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                aria-label={label}
                className="flex items-center gap-1.5 px-3 py-3 rounded-lg text-sm font-medium transition-[color,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 focus-visible:ring-offset-1"
                style={({ isActive }) => ({
                  background: isActive ? `${theme.accent}22` : 'transparent',
                  color: isActive ? theme.accent : theme.text2,
                })}
              >
                <span aria-hidden="true">{icon}</span>
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}

          </nav>
        </div>
      </header>

      {/* Main content */}
      <main id="main" tabIndex={-1} className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
