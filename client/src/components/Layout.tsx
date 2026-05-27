import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import Footer from '@/components/Footer';

// Filled SVG icons (Heroicons v2 solid, 20×20)
const PlusCircleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
  </svg>
);


const SettingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
  </svg>
);

const AnalyzeCVIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 2.755C7 11.235 7 11.235 7 11.235v1.515c0 .414.336.75.75.75h3a.75.75 0 000-1.5h-3V11.235z" clipRule="evenodd" />
  </svg>
);

const HomeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
  </svg>
);

const ApplicationsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M6 3.75A1.75 1.75 0 017.75 2h4.5A1.75 1.75 0 0114 3.75V5h1.25A2.75 2.75 0 0118 7.75v6.5A2.75 2.75 0 0115.25 17H4.75A2.75 2.75 0 012 14.25v-6.5A2.75 2.75 0 014.75 5H6V3.75zM7.5 5h5V3.75a.25.25 0 00-.25-.25h-4.5a.25.25 0 00-.25.25V5z" clipRule="evenodd" />
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
