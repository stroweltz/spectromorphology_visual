import React, { useEffect, useRef, useState } from 'react';
import { Download, RotateCcw, Upload } from 'lucide-react';
import { Group, Toggle } from '../controls';
import { downloadPreset } from '../preset';
import { useToast } from '../toast';
import { cn } from '../utils';

export function SystemTab({
  settings,
  onChange,
  onReset,
  onImport,
  t,
}: {
  settings: any;
  onChange: (key: string, value: any) => void;
  onReset: () => void;
  onImport: (raw: any) => boolean;
  t: any;
}) {
  const notify = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [wakeSupported, setWakeSupported] = useState(true);

  const RESOLUTIONS = [
    { id: 3840, name: t.resNotes?.[3840]?.name || '4K Cinema', note: t.resNotes?.[3840]?.note || 'Max fidelity' },
    { id: 2560, name: t.resNotes?.[2560]?.name || 'Retina', note: t.resNotes?.[2560]?.note || 'HiDPI' },
    { id: 2048, name: t.resNotes?.[2048]?.name || 'High', note: t.resNotes?.[2048]?.note || 'Sharp' },
    { id: 1536, name: t.resNotes?.[1536]?.name || 'Balanced', note: t.resNotes?.[1536]?.note || 'Best ratio' },
    { id: 1024, name: t.resNotes?.[1024]?.name || 'Turbo', note: t.resNotes?.[1024]?.note || 'Fastest' },
  ] as const;

  useEffect(() => {
    setWakeSupported('wakeLock' in navigator);
  }, []);

  useEffect(() => {
    if (!confirmReset) return;
    const timer = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmReset]);

  const memoryMb = (settings.resolution * settings.resolution * 0.5625 * 4) / (1024 * 1024);

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    try {
      const ok = onImport(JSON.parse(await file.text()));
      notify(ok ? (t.toastImportSuccess || 'Preset imported successfully') : (t.toastImportInvalid || 'Invalid preset file'));
    } catch {
      notify(t.toastImportError || 'Could not read preset file');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
      <Group title={t.drawingCanvas}>
        <Toggle
          label={t.persistent}
          description={t.persistentDesc}
          checked={settings.persistent}
          onChange={(v) => onChange('persistent', v)}
        />
      </Group>

      <Group
        title={t.canvasResolution}
        aside={
          <span className="font-mono text-[10px] text-white/40">~{Math.round(memoryMb)} MB {t.resBuffer}</span>
        }
      >
        <div role="radiogroup" aria-label={t.canvasResolution} className="flex flex-col gap-1.5">
          {RESOLUTIONS.map((r) => {
            const active = settings.resolution === r.id;
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange('resolution', r.id)}
                className={cn(
                  'relative flex cursor-pointer items-center justify-between gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition-all duration-200 focus-visible:outline-2 focus-visible:outline-cyan-glow',
                  active
                    ? 'border-cyan-glow/50 bg-white/[0.07] shadow-[0_0_22px_-8px_rgba(94,231,255,0.8)]'
                    : 'border-white/[0.07] bg-black/20 hover:border-white/20',
                )}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className={cn(
                      'size-3 shrink-0 rounded-full border-2 transition-all',
                      active
                        ? 'border-cyan-glow bg-cyan-glow shadow-[0_0_8px_rgba(94,231,255,0.9)]'
                        : 'border-white/25',
                    )}
                  />
                  <span>
                    <span className="block text-[12.5px] font-medium text-white/90">{r.name}</span>
                    <span className="block text-[10.5px] text-white/40">{r.note}</span>
                  </span>
                </span>
                <span className="font-mono text-[11px] tabular-nums text-white/60">{r.id}px</span>
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-cyan-glow to-violet-glow opacity-60"
                  style={{ width: `${(r.id / 3840) * 100}%` }}
                />
              </button>
            );
          })}
        </div>
      </Group>

      <Group title={t.display}>
        <Toggle
          label={t.wakeLock}
          description={
            wakeSupported
              ? t.wakeLockDesc
              : t.wakeLockUnsupported
          }
          checked={settings.wakeLock && wakeSupported}
          onChange={(v) => wakeSupported && onChange('wakeLock', v)}
        />
      </Group>

      <Group title={t.storage}>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              downloadPreset(settings);
              notify(t.toastSave || 'Preset exported as JSON');
            }}
            className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-[12px] text-white/80 transition-colors hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-glow"
          >
            <Download className="size-3.5" /> {t.exportJson}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-[12px] text-white/80 transition-colors hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-glow"
          >
            <Upload className="size-3.5" /> {t.importJson}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-label={t.importJson}
            onChange={(e) => handleFileChange(e.target.files?.[0])}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (!confirmReset) return setConfirmReset(true);
            onReset();
            setConfirmReset(false);
            notify(t.toastReset || 'Factory settings restored');
          }}
          className={cn(
            'flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border text-[12px] transition-all',
            confirmReset
              ? 'border-rose-500/60 bg-rose-500/15 text-rose-300 shadow-[0_0_24px_-4px_rgba(244,63,94,0.6)]'
              : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white/85',
          )}
        >
          <RotateCcw className="size-3.5" />
          {confirmReset ? t.confirmReset : t.restoreDefaults}
        </button>
      </Group>
    </>
  );
}
