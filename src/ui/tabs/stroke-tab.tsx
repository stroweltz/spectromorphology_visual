import React from 'react';
import { Group, Pill, Slider } from '../controls';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function StrokeTab({
  settings,
  onChange,
  t,
}: {
  settings: any;
  onChange: (key: string, value: any) => void;
  t: any;
}) {
  const PRESETS = [
    { label: t.hairline, value: 1.5 },
    { label: t.finePen, value: 3.8 },
    { label: t.mediumBrush, value: 7.0 },
    { label: t.boldCalligraphy, value: 10.0 },
  ];

  return (
    <>
      <Group title={t.masterWidth}>
        <Slider
          label={t.widthCeiling}
          value={settings.strokeWidth}
          min={0.5}
          max={14}
          step={0.1}
          onChange={(v) => onChange('strokeWidth', v)}
          format={(v) => `${v.toFixed(1)} px`}
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.masterWidth}>
          {PRESETS.map((p) => (
            <Pill
              key={p.label}
              active={Math.abs(settings.strokeWidth - p.value) < 0.15}
              onClick={() => onChange('strokeWidth', p.value)}
              sub={p.value.toFixed(1)}
            >
              {p.label}
            </Pill>
          ))}
        </div>
      </Group>

      <Group title={t.paperShading}>
        <Slider
          label={t.roughEdge}
          value={settings.roughEdge}
          min={0}
          max={1}
          onChange={(v) => onChange('roughEdge', v)}
          format={pct}
        />
        <Slider
          label={t.fiberDensity}
          value={settings.fiberDensity}
          min={0}
          max={1}
          onChange={(v) => onChange('fiberDensity', v)}
          format={pct}
        />
        <Slider
          label={t.darkEdge}
          value={settings.darkEdge}
          min={0}
          max={1}
          onChange={(v) => onChange('darkEdge', v)}
          format={pct}
        />
        <Slider
          label={t.highlight}
          value={settings.highlight}
          min={0}
          max={1}
          onChange={(v) => onChange('highlight', v)}
          format={pct}
        />
      </Group>

      <Group title={t.strokeDynamics}>
        <Slider
          label={t.breathSpeed}
          value={settings.breathSpeed}
          min={0}
          max={3}
          onChange={(v) => onChange('breathSpeed', v)}
          format={(v) => `${v.toFixed(2)}×`}
        />
        <Slider
          label={t.centerTaper}
          value={settings.centerTaper}
          min={0}
          max={1}
          onChange={(v) => onChange('centerTaper', v)}
          format={pct}
        />
        <Slider
          label={t.tipSharpness}
          value={settings.tipSharpness}
          min={0}
          max={1}
          onChange={(v) => onChange('tipSharpness', v)}
          format={pct}
        />
      </Group>
    </>
  );
}
