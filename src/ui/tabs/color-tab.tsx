import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { ColorChip, Group, Segmented } from '../controls';
import { cn } from '../utils';

export function ColorTab({
  settings,
  themes,
  onChange,
  onApplyTheme,
  onLayerChange,
  t,
}: {
  settings: any;
  themes: any[];
  onChange: (key: string, value: any) => void;
  onApplyTheme: (themeId: string) => void;
  onLayerChange: (layerId: string, partial: any) => void;
  t: any;
}) {
  const LAYERS = [
    { id: 'core', index: 0, name: t.coreName, note: t.coreNote },
    { id: 'middle', index: 1, name: t.middleName, note: t.middleNote },
    { id: 'orbit', index: 2, name: t.orbitName, note: t.orbitNote },
  ];

  return (
    <>
      <Group title={t.visualTheme}>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t.visualTheme}>
          {themes.map((theme, i) => {
            const active = settings.theme === theme.id || settings.colorTheme === theme.title;
            const bgGradient = theme.bg
              ? `radial-gradient(120% 140% at 20% 0%, ${theme.bg.center || theme.bgInner}, ${theme.bg.deep || theme.bgOuter} 80%)`
              : `radial-gradient(120% 140% at 20% 0%, ${theme.bgInner || '#1c1c33'}, ${theme.bgOuter || '#030303'} 80%)`;

            const colors = theme.colors || (theme.layers ? [theme.layers[0].color, theme.layers[1]?.color || '#00d2d3', theme.layers[2]?.color || '#9b59b6'] : ['#ff2fd6', '#19f3ff', '#b6ff3c']);

            return (
              <button
                key={theme.id || theme.title}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onApplyTheme(theme.id || theme.title)}
                className={cn(
                  'group/theme relative cursor-pointer overflow-hidden rounded-xl border p-2 text-left transition-all duration-200 focus-visible:outline-2 focus-visible:outline-cyan-glow',
                  i === themes.length - 1 && themes.length % 2 === 1 && 'col-span-2',
                  active
                    ? 'border-cyan-glow/60 bg-white/[0.07] shadow-[0_0_24px_-6px_rgba(94,231,255,0.6)]'
                    : 'border-white/[0.08] bg-black/20 hover:border-white/25',
                )}
              >
                <div
                  className="relative h-10 overflow-hidden rounded-lg"
                  style={{ background: bgGradient }}
                >
                  <div
                    className="absolute inset-x-2 top-1/2 h-2.5 -translate-y-1/2 -rotate-6 rounded-full opacity-95 blur-[0.5px]"
                    style={{
                      background: `linear-gradient(90deg, ${colors[0]}, ${colors[1]}, ${colors[2]})`,
                    }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-1.5">
                  <div className="min-w-0">
                    <p className="truncate text-[11.5px] font-medium text-white/90">{theme.name || theme.title}</p>
                    <p className="truncate text-[10px] text-white/40">{theme.mood || theme.archetype}</p>
                  </div>
                  <span className="flex shrink-0 -space-x-1">
                    {colors.map((c: string, idx: number) => (
                      <span
                        key={idx}
                        className="size-3 rounded-full border border-black/50"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Group>

      <Group title={t.toneMapping}>
        <Segmented
          label={t.toneMapping}
          value={settings.toneMap}
          onChange={(v) => onChange('toneMap', v)}
          options={[
            { value: 'agx', label: t.agxLabel, sub: t.agxSub },
            { value: 'raw', label: t.rawLabel, sub: t.rawSub },
          ]}
        />
      </Group>

      <Group title={t.layerChannels}>
        {LAYERS.map((l) => {
          const layer = settings.layers?.[l.id] || { visible: true, primary: '#ffffff', split: '#aaaaaa' };
          return (
            <div
              key={l.id}
              className={cn(
                'rounded-xl border border-white/[0.07] bg-black/20 p-2.5 transition-opacity',
                !layer.visible && 'opacity-60',
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-[12.5px] font-medium text-white/90">{l.name}</p>
                  <p className="font-mono text-[9.5px] uppercase tracking-wider text-white/35">{l.note}</p>
                </div>
                <button
                  type="button"
                  aria-pressed={layer.visible}
                  aria-label={`${layer.visible ? t.hideLayer : t.showLayer}: ${l.name}`}
                  onClick={() => onLayerChange(l.id, { visible: !layer.visible })}
                  className={cn(
                    'flex size-8 cursor-pointer items-center justify-center rounded-lg border transition-all focus-visible:outline-2 focus-visible:outline-cyan-glow',
                    layer.visible
                      ? 'border-cyan-glow/40 bg-cyan-glow/10 text-cyan-glow shadow-[0_0_14px_-4px_rgba(94,231,255,0.8)]'
                      : 'border-white/10 text-white/40 hover:text-white/70',
                  )}
                >
                  {layer.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <ColorChip
                  label={t.primary}
                  value={layer.primary}
                  disabled={!layer.visible}
                  onChange={(v) => onLayerChange(l.id, { primary: v })}
                />
                <ColorChip
                  label={t.split}
                  value={layer.split}
                  disabled={!layer.visible}
                  onChange={(v) => onLayerChange(l.id, { split: v })}
                />
              </div>
            </div>
          );
        })}
      </Group>
    </>
  );
}
