import React from 'react';
import { Scissors } from 'lucide-react';
import { Group, Slider, Toggle } from '../controls';

const x = (v: number) => `${v.toFixed(2)}×`;

export function MotionTab({
  settings,
  onChange,
  onSplitNow,
  t,
}: {
  settings: any;
  onChange: (key: string, value: any) => void;
  onSplitNow: () => void;
  t: any;
}) {
  return (
    <>
      <Group title={t.kinematics}>
        <Slider
          label={t.moveSpeed}
          value={settings.moveSpeed}
          min={0}
          max={3}
          onChange={(v) => onChange('moveSpeed', v)}
          format={x}
        />
        <Slider
          label={t.orbitSpeed}
          value={settings.orbitSpeed}
          min={0}
          max={3}
          onChange={(v) => onChange('orbitSpeed', v)}
          format={x}
        />
        <Slider
          label={t.boundaryRadius}
          value={settings.boundaryRadius}
          min={0.3}
          max={1.3}
          onChange={(v) => onChange('boundaryRadius', v)}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <Slider
          label={t.minTurnRadius}
          value={settings.minTurnRadius}
          min={0.05}
          max={1}
          onChange={(v) => onChange('minTurnRadius', v)}
        />
        <Toggle
          label={t.safeTurn}
          description={t.safeTurnDesc}
          checked={settings.safeTurn}
          onChange={(v) => onChange('safeTurn', v)}
        />
      </Group>

      <Group title={t.wobble}>
        <Slider
          label={t.wobbleAmp}
          value={settings.wobbleAmp}
          min={0}
          max={1}
          onChange={(v) => onChange('wobbleAmp', v)}
        />
        <Slider
          label={t.wobbleFreq}
          value={settings.wobbleFreq}
          min={0.2}
          max={6}
          onChange={(v) => onChange('wobbleFreq', v)}
          format={(v) => `${v.toFixed(2)} Hz`}
        />
      </Group>

      <Group title={t.bifurcation}>
        <Slider
          label={t.splitChance}
          value={settings.splitChance}
          min={0}
          max={100}
          step={1}
          onChange={(v) => onChange('splitChance', v)}
          format={(v) => `${Math.round(v)}%`}
        />
        <Slider
          label={t.branchSeparation}
          value={settings.branchSeparation}
          min={0.1}
          max={1.5}
          onChange={(v) => onChange('branchSeparation', v)}
        />
        <Slider
          label={t.splitDuration}
          value={settings.splitDuration}
          min={1}
          max={12}
          step={0.1}
          onChange={(v) => onChange('splitDuration', v)}
          format={(v) => `${v.toFixed(1)} s`}
        />
        <button
          type="button"
          onClick={onSplitNow}
          className="group/split relative mt-1 flex h-11 w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/20 bg-gradient-to-r from-cyan-glow via-violet-glow to-rose-glow text-[13px] font-semibold text-[#07101d] shadow-[0_0_30px_-6px_rgba(139,123,255,0.8)] transition-all duration-200 hover:shadow-[0_0_40px_-4px_rgba(255,95,168,0.75)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98]"
        >
          <span
            aria-hidden
            className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover/split:translate-x-full"
          />
          <Scissors className="relative size-4 transition-transform duration-300 group-hover/split:-rotate-12" />
          <span className="relative">{t.splitNow}</span>
        </button>
      </Group>
    </>
  );
}
