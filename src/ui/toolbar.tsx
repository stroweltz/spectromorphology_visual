import React, { useSyncExternalStore } from 'react';
import { Dices, Eraser, Globe, Maximize, Minimize, PanelRightOpen, Save } from 'lucide-react';
import { fpsStore } from './fps-store';
import { cn } from './utils';
import type { Lang } from './i18n';

function ToolButton({
  label,
  shortcut,
  onClick,
  active,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        'group/tool relative flex h-9 cursor-pointer items-center gap-2 rounded-xl border px-2.5 text-[12px] font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-cyan-glow active:scale-95',
        active
          ? 'border-cyan-glow/40 bg-cyan-glow/10 text-cyan-glow shadow-[0_0_18px_-4px_rgba(94,231,255,0.7)]'
          : 'border-transparent text-white/70 hover:border-white/15 hover:bg-white/[0.06] hover:text-white',
      )}
    >
      {children}
      <span className="sr-only xl:not-sr-only">{label}</span>
    </button>
  );
}

function EngineBadge() {
  const fps = useSyncExternalStore(fpsStore.subscribe, fpsStore.getFps);
  const frametime = useSyncExternalStore(fpsStore.subscribe, fpsStore.getFrametime);
  const engine = useSyncExternalStore(fpsStore.subscribe, fpsStore.getEngine);

  const tone = fps >= 50 ? 'bg-emerald-400' : fps >= 30 ? 'bg-amber-400' : 'bg-rose-500';

  return (
    <div
      className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-white/[0.08] bg-black/40 px-2.5 font-mono text-[10.5px] text-white/70 backdrop-blur-md"
      role="status"
      aria-label={`${fps} FPS, ${engine} engine`}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full shadow-[0_0_8px_currentColor]', tone, fps === 0 && 'bg-white/20')} />
      <span className="inline-block min-w-[2.5ch] text-right tabular-nums font-semibold text-white">
        {fps > 0 ? fps : '--'}
      </span>
      <span className="text-white/35">FPS</span>
      {frametime > 0 && (
        <span className="hidden items-center gap-2 sm:inline-flex">
          <span className="h-3 w-px bg-white/10" />
          <span className="tabular-nums text-white/60">{frametime.toFixed(1)}ms</span>
        </span>
      )}
      <span className="hidden items-center gap-2 md:inline-flex">
        <span className="h-3 w-px bg-white/10" />
        <span className="font-medium text-cyan-glow">{engine}</span>
      </span>
    </div>
  );
}

export function Toolbar({
  zen,
  panelOpen,
  lang,
  t,
  onToggleLang,
  onZen,
  onReroll,
  onSave,
  onClear,
  onOpenPanel,
}: {
  zen: boolean;
  panelOpen: boolean;
  lang: Lang;
  t: any;
  onToggleLang: () => void;
  onZen: () => void;
  onReroll: () => void;
  onSave: () => void;
  onClear: () => void;
  onOpenPanel: () => void;
}) {
  return (
    <header
      className={cn(
        'fixed left-2 right-2 top-2 z-40 flex items-center justify-between gap-2 transition-all duration-500 md:left-4 md:right-auto md:top-4',
        zen && 'pointer-events-none -translate-y-4 opacity-0',
      )}
    >
      <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#0a0e17]/70 p-1 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-[20px]">
        <div className="flex items-center gap-2 px-2.5 max-md:hidden">
          <span
            aria-hidden
            className="size-5 rounded-md bg-[conic-gradient(from_200deg,#5ee7ff,#8b7bff,#ff5fa8,#5ee7ff)] shadow-[0_0_14px_-2px_rgba(139,123,255,0.9)]"
          />
          <h1 className="text-[12.5px] font-semibold tracking-tight text-white">
            {t.brand}
          </h1>
        </div>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-white/10 max-md:hidden" />
        <ToolButton label={t.zen} shortcut="Z" onClick={onZen} active={zen}>
          {zen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
        </ToolButton>
        <ToolButton label={t.reroll} shortcut="R" onClick={onReroll}>
          <Dices className="size-4" />
        </ToolButton>
        <ToolButton label={t.save} shortcut="S" onClick={onSave}>
          <Save className="size-4" />
        </ToolButton>
        <ToolButton label={t.clear} shortcut="C" onClick={onClear}>
          <Eraser className="size-4" />
        </ToolButton>

        {/* Language Switcher Button */}
        <button
          type="button"
          onClick={onToggleLang}
          title={lang === 'ru' ? 'Switch to English' : 'Переключить на русский'}
          aria-label={lang === 'ru' ? 'Switch to English' : 'Переключить на русский'}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-transparent px-2 text-[11px] font-semibold text-white/70 transition-all hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
        >
          <Globe className="size-3.5 text-cyan-glow/80" />
          <span className="font-mono uppercase">{lang === 'ru' ? 'RU' : 'EN'}</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <EngineBadge />
        {!panelOpen && (
          <button
            type="button"
            onClick={onOpenPanel}
            aria-label={t.controls}
            className="flex size-9 cursor-pointer items-center justify-center rounded-xl border border-white/[0.08] bg-[#0a0e17]/70 text-white/80 backdrop-blur-[20px] transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-glow md:hidden"
          >
            <PanelRightOpen className="size-4 -rotate-90" />
          </button>
        )}
      </div>
    </header>
  );
}
