import { Coffee, HardDrive, Heart, Lock, ShieldCheck } from 'lucide-react';
import { Button, Surface } from '@/components/ui';
import { useTheme } from '@/contexts/ThemeContext';

export default function DonatePage() {
  const { theme } = useTheme();

  const badges = [
    { icon: ShieldCheck, label: '100% free forever', color: '#16a34a' },
    { icon: Lock, label: 'No ads or tracking', color: '#f59e0b' },
    { icon: HardDrive, label: 'Your data, your device', color: theme.accent },
  ];

  const options = [
    {
      icon: Coffee,
      title: 'Buy Me a Coffee',
      sub: 'One-time donation, any amount',
      url: 'https://buymeacoffee.com/larsmikki',
      label: 'Buy Me a Coffee',
    },
    {
      icon: Heart,
      title: 'PayPal',
      sub: 'Quick donation through PayPal',
      url: 'https://paypal.me/larsmikki',
      label: 'Donate via PayPal',
    },
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">Support Applyr</h1>
        <p className="text-sm mt-0.5 text-text2">
          I build privacy-first, self-hosted tools with no subscriptions, no ads, and no tracking.
          Your data stays yours.
        </p>
      </div>

      <Surface className="p-6 mb-5">
        <h2 className="text-base font-bold mb-1 text-text">What you get</h2>
        <p className="text-xs mb-5 text-text2">Applyr stays free, open source, and self-hosted.</p>
        <div className="flex flex-wrap gap-2">
          {badges.map(({ icon: Icon, label, color }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: `${color}15`, color, border: `1px solid ${color}20` }}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </Surface>

      <Surface className="p-6 mb-5">
        <h2 className="text-base font-bold mb-1 text-text">Donate</h2>
        <p className="text-xs mb-5 text-text2">One-time donations through Buy Me a Coffee or PayPal.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          {options.map(({ icon: Icon, title, sub, url, label }) => (
            <div
              key={title}
              className="flex flex-col items-center text-center gap-4 rounded-xl p-6"
              style={{ background: theme.surface2, border: `1px solid ${theme.border}` }}
            >
              <Icon className="h-9 w-9" style={{ color: theme.accent }} aria-hidden="true" />
              <div>
                <h3 className="text-base font-bold leading-snug mb-1 text-text">{title}</h3>
                <p className="text-xs text-text2">{sub}</p>
              </div>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
              >
                {label}
              </Button>
            </div>
          ))}
        </div>
      </Surface>

      <Surface className="p-6">
        <h2 className="text-base font-bold mb-1 text-text">Thank you</h2>
        <p className="text-xs text-text2">Every bit of support helps keep Applyr available for everyone.</p>
      </Surface>
    </div>
  );
}
