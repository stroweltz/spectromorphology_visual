import React from 'react';
import { ColorChip, Group, Segmented, Slider, Toggle } from '../controls';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function AtmosphereTab({
  settings,
  onChange,
  t,
}: {
  settings: any;
  onChange: (key: string, value: any) => void;
  t: any;
}) {
  const MODES = [
    { value: 'nebula', label: t.modes?.nebula || 'Nebula Breath' },
    { value: 'waves', label: t.modes?.waves || 'Ripple Waves' },
    { value: 'aurora', label: t.modes?.aurora || 'Aurora Borealis' },
    { value: 'radial', label: t.modes?.radial || 'Soft Radial' },
    { value: 'solid', label: t.modes?.solid || 'Deep Solid' },
  ];

  return (
    <>
      <Group title={t.neonBloom}>
        <Toggle
          label={t.neonBloomToggle}
          description={t.neonBloomDesc}
          checked={settings.bloomEnabled ?? true}
          onChange={(v) => onChange('bloomEnabled', v)}
        />
        <Slider
          label={t.bloomIntensity}
          value={settings.neonBloom ?? 0.35}
          min={0}
          max={1}
          step={0.01}
          disabled={!settings.bloomEnabled}
          onChange={(v) => onChange('neonBloom', v)}
          format={pct}
        />
        <Slider
          label={t.bloomRadius}
          value={settings.bloomRadius ?? 12}
          min={4}
          max={32}
          step={1}
          disabled={!settings.bloomEnabled}
          onChange={(v) => onChange('bloomRadius', v)}
          format={(v) => `${Math.round(v)} px`}
        />
        <Slider
          label={t.bloomContrast}
          value={settings.bloomContrast ?? 2.5}
          min={1.0}
          max={2.5}
          step={0.05}
          disabled={!settings.bloomEnabled}
          onChange={(v) => onChange('bloomContrast', v)}
          format={(v) => `${v.toFixed(2)}×`}
        />
      </Group>

      <Group title={t.bgMode}>
        <Segmented
          label={t.bgMode}
          value={settings.bgMode}
          options={MODES}
          columns={2}
          onChange={(v) => onChange('bgMode', v)}
        />
      </Group>

      <Group title={t.atmosphere}>
        <Slider
          label={t.nebulaIntensity}
          value={settings.glow}
          min={0}
          max={1}
          onChange={(v) => onChange('glow', v)}
          format={pct}
        />
        <Slider
          label={t.pulseSpeed}
          value={settings.pulseSpeed}
          min={0}
          max={2}
          onChange={(v) => onChange('pulseSpeed', v)}
          format={(v) => `${v.toFixed(2)}×`}
        />
        <Slider
          label={t.bgScale}
          value={settings.bgScale}
          min={0.5}
          max={2}
          onChange={(v) => onChange('bgScale', v)}
          format={(v) => `${v.toFixed(2)}×`}
        />
        <Slider
          label={t.vignette}
          value={settings.vignette}
          min={0}
          max={1}
          onChange={(v) => onChange('vignette', v)}
          format={pct}
        />
        <Slider
          label={t.grain}
          value={settings.grain}
          min={0}
          max={1}
          onChange={(v) => onChange('grain', v)}
          format={pct}
        />
      </Group>

      <Group title={t.bgGradient}>
        <div
          aria-hidden
          className="h-8 rounded-lg border border-white/10"
          style={{
            background: `linear-gradient(90deg, ${settings.bgCenter}, ${settings.bgAccent}, ${settings.bgDeep})`,
          }}
        />
        <div className="flex flex-wrap gap-2">
          <ColorChip
            label={t.bgCenter}
            value={settings.bgCenter}
            onChange={(v) => onChange('bgCenter', v)}
          />
          <ColorChip
            label={t.bgAccent}
            value={settings.bgAccent}
            onChange={(v) => onChange('bgAccent', v)}
          />
          <ColorChip
            label={t.bgDeep}
            value={settings.bgDeep}
            onChange={(v) => onChange('bgDeep', v)}
          />
        </div>
      </Group>
    </>
  );
}
