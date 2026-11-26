export type TabName = 'home' | 'history' | 'muscles' | 'settings';

const TABS: { name: TabName; label: string; icon: string }[] = [
  { name: 'home', label: 'Home', icon: 'M3 9.5 10 3l7 6.5V17H3z' },
  { name: 'history', label: 'Stats', icon: 'M4 17v-6M10 17V4M16 17V8' },
  { name: 'muscles', label: 'Muscles', icon: 'M2 10h16M5 6v8M15 6v8' },
  { name: 'settings', label: 'Settings', icon: 'M3 6h14M3 14h14M7 4v4M13 12v4' },
];

/** Bottom navigation, shown on every screen except a workout in progress. */
export function TabBar({ current, onGo, badge }: { current: TabName; onGo: (tab: TabName) => void; badge?: Partial<Record<TabName, boolean>> }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <button type="button" key={t.name} className={current === t.name ? 'on' : ''} aria-current={current === t.name ? 'page' : undefined} onClick={() => onGo(t.name)}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d={t.icon} />
          </svg>
          <span>
            {t.label}
            {badge?.[t.name] && <i className="tabbar-dot" aria-label="needs attention" />}
          </span>
        </button>
      ))}
    </nav>
  );
}
