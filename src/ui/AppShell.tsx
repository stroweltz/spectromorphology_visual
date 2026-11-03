import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PanelRightOpen } from 'lucide-react';
import { ControlPanel, type TabId } from './control-panel';
import { Toolbar } from './toolbar';
import { ToastProvider, useToast } from './toast';
import { downloadPreset } from './preset';
import { i18n, type Lang } from './i18n';

export interface EngineBridge {
  getInitialSettings: () => any;
  getThemes: () => any[];
  onParamChange: (key: string, value: any) => void;
  onLayerChange: (layerId: string, partial: any) => void;
  onApplyTheme: (themeId: string) => void;
  onSplitNow: () => void;
  onReroll: () => void;
  onClearCanvas: () => void;
  onReset: () => void;
  onImport: (raw: any) => boolean;
}

function Shell({ engine }: { engine: EngineBridge }) {
  const notify = useToast();
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return (localStorage.getItem('spectro_lang') as Lang) || 'ru';
    } catch {
      return 'ru';
    }
  });
  const t = i18n[lang];

  const handleToggleLang = useCallback(() => {
    setLang((prev) => {
      const next: Lang = prev === 'ru' ? 'en' : 'ru';
      try {
        localStorage.setItem('spectro_lang', next);
      } catch {}
      return next;
    });
  }, []);

  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<TabId>('mandala');
  const [zen, setZen] = useState(false);
  const [settings, setSettings] = useState(() => engine.getInitialSettings());
  const enteredFullscreen = useRef(false);

  const themes = engine.getThemes();

  // Screen Wake Lock
  useEffect(() => {
    if (!settings.wakeLock || !('wakeLock' in navigator)) return;
    let sentinel: any = null;
    let cancelled = false;

    const request = async () => {
      try {
        const next = await (navigator as any).wakeLock.request('screen');
        if (cancelled) void next.release();
        else sentinel = next;
      } catch {
        sentinel = null;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release?.();
    };
  }, [settings.wakeLock]);

  const toggleZen = useCallback(async () => {
    if (zen) {
      setZen(false);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      enteredFullscreen.current = false;
      return;
    }
    setZen(true);
    try {
      await document.documentElement.requestFullscreen();
      enteredFullscreen.current = true;
    } catch {
      enteredFullscreen.current = false;
    }
  }, [zen]);

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && enteredFullscreen.current) {
        enteredFullscreen.current = false;
        setZen(false);
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const handleChange = useCallback((key: string, value: any) => {
    setSettings((prev: any) => ({ ...prev, [key]: value }));
    engine.onParamChange(key, value);
  }, [engine]);

  const handleLayerChange = useCallback((layerId: string, partial: any) => {
    setSettings((prev: any) => ({
      ...prev,
      layers: {
        ...prev.layers,
        [layerId]: { ...prev.layers[layerId], ...partial }
      }
    }));
    engine.onLayerChange(layerId, partial);
  }, [engine]);

  const handleApplyTheme = useCallback((themeId: string) => {
    engine.onApplyTheme(themeId);
    // Refresh updated settings from engine
    const next = engine.getInitialSettings();
    setSettings((prev: any) => ({ ...prev, ...next, theme: themeId, colorTheme: themeId }));
    notify(`${t.toastThemeApplied}${themeId}`);
  }, [engine, notify, t.toastThemeApplied]);

  const doReroll = useCallback(() => {
    engine.onReroll();
    const next = engine.getInitialSettings();
    setSettings(next);
    notify(t.toastReroll);
  }, [engine, notify, t.toastReroll]);

  const doSave = useCallback(() => {
    downloadPreset(settings, settings.theme);
    notify(t.toastSave);
  }, [settings, notify, t.toastSave]);

  const doClear = useCallback(() => {
    engine.onClearCanvas();
    notify(t.toastClear);
  }, [engine, notify, t.toastClear]);

  const doSplitNow = useCallback(() => {
    engine.onSplitNow();
    notify(t.toastSplit);
  }, [engine, notify, t.toastSplit]);

  const doReset = useCallback(() => {
    engine.onReset();
    const next = engine.getInitialSettings();
    setSettings(next);
    notify(t.toastReset);
  }, [engine, notify, t.toastReset]);

  const doImport = useCallback((raw: any) => {
    const ok = engine.onImport(raw);
    if (ok) {
      const next = engine.getInitialSettings();
      setSettings(next);
    }
    return ok;
  }, [engine]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'text'))) return;
      switch (e.key.toLowerCase()) {
        case 'z':
          void toggleZen();
          break;
        case 'r':
          doReroll();
          break;
        case 's':
          doSave();
          break;
        case 'c':
          doClear();
          break;
        case 'h':
          setOpen((o) => !o);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleZen, doReroll, doSave, doClear]);

  return (
    <>
      <Toolbar
        zen={zen}
        panelOpen={open}
        lang={lang}
        t={t}
        onToggleLang={handleToggleLang}
        onZen={toggleZen}
        onReroll={doReroll}
        onSave={doSave}
        onClear={doClear}
        onOpenPanel={() => setOpen(true)}
      />

      <ControlPanel
        open={open && !zen}
        onClose={() => setOpen(false)}
        tab={tab}
        onTabChange={setTab}
        settings={settings}
        themes={themes}
        onChange={handleChange}
        onApplyTheme={handleApplyTheme}
        onLayerChange={handleLayerChange}
        onSplitNow={doSplitNow}
        onReset={doReset}
        onImport={doImport}
        t={t}
      />

      {!open && !zen && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t.controls}
          className="fixed right-4 top-4 z-40 flex h-10 cursor-pointer items-center gap-2 rounded-2xl border border-white/[0.08] bg-[#0a0e17]/70 px-3.5 text-[12px] font-medium text-white/85 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-[20px] transition-colors hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-glow max-md:hidden"
        >
          <PanelRightOpen className="size-4 text-cyan-glow" />
          {t.controls}
        </button>
      )}
    </>
  );
}

export function AppShell({ engine }: { engine: EngineBridge }) {
  return (
    <ToastProvider>
      <Shell engine={engine} />
    </ToastProvider>
  );
}
