import React, { useRef, type ComponentType, type KeyboardEvent } from 'react';
import { Aperture, Flower2, Orbit, Palette, PanelRightClose, PenTool, Settings2, Sun } from 'lucide-react';
import { MandalaTab } from './tabs/mandala-tab';
import { ColorTab } from './tabs/color-tab';
import { StrokeTab } from './tabs/stroke-tab';
import { MotionTab } from './tabs/motion-tab';
import { AtmosphereTab } from './tabs/atmosphere-tab';
import { SystemTab } from './tabs/system-tab';
import { cn } from './utils';

export type TabId = 'mandala' | 'color' | 'stroke' | 'motion' | 'atmosphere' | 'system';

interface TabConfig {
  id: TabId;
  label: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
}

const TABS: TabConfig[] = [
  { id: 'mandala', label: 'Mandala', title: 'Mandala & Symmetry', icon: Flower2 },
  { id: 'color', label: 'Color', title: 'Color Themes & Layers', icon: Palette },
  { id: 'stroke', label: 'Stroke', title: 'Stroke & Paper Texture', icon: PenTool },
  { id: 'motion', label: 'Motion', title: 'Motion & Bifurcation', icon: Orbit },
  { id: 'atmosphere', label: 'Glow', title: 'Atmosphere & Glow', icon: Sun },
  { id: 'system', label: 'System', title: 'Canvas & System', icon: Settings2 },
];

export function ControlPanel({
  open,
  onClose,
  tab,
  onTabChange,
  settings,
  themes,
  onChange,
  onApplyTheme,
  onLayerChange,
  onSplitNow,
  onReset,
  onImport,
  t,
}: {
  open: boolean;
  onClose: () => void;
  tab: TabId;
  onTabChange: (t: TabId) => void;
  settings: any;
  themes: any[];
  onChange: (key: string, value: any) => void;
  onApplyTheme: (themeId: string) => void;
  onLayerChange: (layerId: string, partial: any) => void;
  onSplitNow: () => void;
  onReset: () => void;
  onImport: (raw: any) => boolean;
  t: any;
}) {
  const tabs: TabConfig[] = [
    { id: 'mandala', label: t.tabMandala, title: t.tabMandalaTitle, icon: Flower2 },
    { id: 'color', label: t.tabColor, title: t.tabColorTitle, icon: Palette },
    { id: 'stroke', label: t.tabStroke, title: t.tabStrokeTitle, icon: PenTool },
    { id: 'motion', label: t.tabMotion, title: t.tabMotionTitle, icon: Orbit },
    { id: 'atmosphere', label: t.tabAtmosphere, title: t.tabAtmosphereTitle, icon: Sun },
    { id: 'system', label: t.tabSystem, title: t.tabSystemTitle, icon: Settings2 },
  ];

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeIndex = Math.max(0, tabs.findIndex((item) => item.id === tab));
  const active = tabs[activeIndex] || tabs[0];

  const onKeyDown = (e: KeyboardEvent) => {
    let next = activeIndex;
    if (e.key === 'ArrowRight') next = (activeIndex + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (activeIndex - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    onTabChange(tabs[next].id);
    tabRefs.current[tabs[next].id]?.focus();
  };

  return (
    <aside
      aria-label="Spectromorphology control panel"
      className={cn(
        'fixed z-40 flex flex-col overflow-hidden border border-white/[0.08] bg-[#0a0e17]/85 backdrop-blur-[20px] backdrop-saturate-150',
        'shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.07)]',
        'transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'inset-x-2 bottom-2 max-h-[64dvh] rounded-[26px]',
        'md:inset-x-auto md:bottom-4 md:right-4 md:top-4 md:max-h-none md:w-[392px]',
        open
          ? 'translate-x-0 translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-[calc(100%+1rem)] opacity-0 md:translate-x-[calc(100%+2rem)] md:translate-y-0',
      )}
    >
      {/* soft sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-violet-glow/[0.08] to-transparent"
      />

      <header className="relative flex items-center justify-between gap-3 px-4 pb-2 pt-3.5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.22em] text-white/40">
            <Aperture className="size-3 text-cyan-glow" aria-hidden />
            {t.rackSubtitle || 'Control rack'}
            <span className="text-white/25">
              {String(activeIndex + 1).padStart(2, '0')}/{String(tabs.length).padStart(2, '0')}
            </span>
          </p>
          <h2 className="mt-1 truncate text-[15px] font-semibold tracking-tight text-white">{active.title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Collapse control panel"
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/[0.08] text-white/50 transition-colors hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-glow"
        >
          <PanelRightClose className="size-4 max-md:rotate-90" />
        </button>
      </header>

      <div
        role="tablist"
        aria-label="Control sections"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="relative mx-3 grid grid-cols-6 gap-1 rounded-2xl border border-white/[0.07] bg-black/40 p-1"
      >
        {tabs.map((tabItem) => {
          const isActive = tabItem.id === tab;
          const Icon = tabItem.icon;
          return (
            <button
              key={tabItem.id}
              ref={(el) => {
                tabRefs.current[tabItem.id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${tabItem.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tabItem.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onTabChange(tabItem.id)}
              className={cn(
                'relative flex cursor-pointer flex-col items-center gap-1 rounded-xl px-0.5 py-2 transition-all duration-200 focus-visible:outline-2 focus-visible:outline-cyan-glow',
                isActive
                  ? 'bg-gradient-to-b from-white/[0.14] to-white/[0.05] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] font-medium'
                  : 'text-white/40 hover:bg-white/[0.04] hover:text-white/75',
              )}
            >
              <Icon className={cn('size-4 transition-colors', isActive && 'text-cyan-glow')} />
              <span className="font-mono text-[8.5px] uppercase tracking-wider">{tabItem.label}</span>
              {isActive && (
                <span
                  aria-hidden
                  className="absolute -bottom-px left-1/4 h-px w-1/2 bg-cyan-glow shadow-[0_0_8px_2px_rgba(94,231,255,0.8)]"
                />
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        key={tab}
        tabIndex={0}
        className="spectro-scroll animate-in fade-in slide-in-from-bottom-1 relative mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-5 duration-300 focus-visible:outline-none"
      >
        {tab === 'mandala' && <MandalaTab settings={settings} onChange={onChange} t={t} />}
        {tab === 'color' && (
          <ColorTab
            settings={settings}
            themes={themes}
            onChange={onChange}
            onApplyTheme={onApplyTheme}
            onLayerChange={onLayerChange}
            t={t}
          />
        )}
        {tab === 'stroke' && <StrokeTab settings={settings} onChange={onChange} t={t} />}
        {tab === 'motion' && (
          <MotionTab
            settings={settings}
            onChange={onChange}
            onSplitNow={onSplitNow}
            t={t}
          />
        )}
        {tab === 'atmosphere' && <AtmosphereTab settings={settings} onChange={onChange} t={t} />}
        {tab === 'system' && (
          <SystemTab
            settings={settings}
            onChange={onChange}
            onReset={onReset}
            onImport={onImport}
            t={t}
          />
        )}
      </div>
    </aside>
  );
}
