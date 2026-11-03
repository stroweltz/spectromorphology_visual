import React from 'react';
import { Group, Pill, Slider, Toggle } from '../controls';
import { SectorDial } from '../sector-dial';

export const SECTOR_STOPS = [4, 6, 8, 12, 16, 24, 32] as const;

export function MandalaTab({
  settings,
  onChange,
  t,
}: {
  settings: any;
  onChange: (key: string, value: any) => void;
  t: any;
}) {
  const dirLabel = (v: number) => {
    if (Math.abs(v) < 0.005) return t.dirStill;
    const prefix = v > 0 ? t.dirCw : t.dirCcw;
    return `${prefix} ${Math.abs(v).toFixed(2)}`;
  };

  return (
    <>
      <Group title={t.sectors}>
        <SectorDial
          value={settings.sectors}
          stops={SECTOR_STOPS}
          label={t.sectors}
          onChange={(v) => onChange('sectors', v)}
        />
        <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label={t.sectorTitle}>
          {SECTOR_STOPS.map((n) => (
            <Pill
              key={n}
              active={settings.sectors === n}
              onClick={() => onChange('sectors', n)}
              className="min-w-10 px-2.5"
            >
              {n}
            </Pill>
          ))}
        </div>
      </Group>

      <Group title={t.symmetry}>
        <Toggle
          label={t.mirror}
          description={t.mirrorDesc}
          checked={settings.mirror}
          onChange={(v) => onChange('mirror', v)}
        />
      </Group>

      <Group title={t.rotation}>
        <Toggle
          label={t.autoRotate}
          description={t.autoRotateDesc}
          checked={settings.autoRotate}
          onChange={(v) => onChange('autoRotate', v)}
        />
        <Slider
          label={t.rotateSpeed}
          value={settings.rotateSpeed}
          min={-1}
          max={1}
          step={0.01}
          bipolar
          disabled={!settings.autoRotate}
          onChange={(v) => onChange('rotateSpeed', v)}
          format={dirLabel}
        />
      </Group>

      <Group title={t.camera}>
        <Slider
          label={t.zoom}
          value={settings.zoom}
          min={40}
          max={300}
          step={1}
          onChange={(v) => onChange('zoom', v)}
          format={(v) => `${Math.round(v)}%`}
        />
      </Group>
    </>
  );
}
