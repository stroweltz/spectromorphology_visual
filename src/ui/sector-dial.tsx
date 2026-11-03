import React, { useId, useRef } from 'react';

const START = -135;
const SWEEP = 270;
const SIZE = 184;
const C = SIZE / 2;

function polar(angleDeg: number, r: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
}

function arcPath(from: number, to: number, r: number) {
  const s = polar(from, r);
  const e = polar(to, r);
  const large = to - from > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

export function SectorDial({
  value,
  stops,
  onChange,
  label = 'SECTORS',
}: {
  value: number;
  stops: readonly number[];
  onChange: (v: number) => void;
  label?: string;
}) {
  const gradId = useId();
  const ref = useRef<SVGSVGElement>(null);
  const index = Math.max(0, stops.indexOf(value));
  const angleFor = (i: number) => START + (i * SWEEP) / (stops.length - 1);
  const angle = angleFor(index >= 0 ? index : 0);
  const tip = polar(angle, 50);
  const base = polar(angle, 28);

  const fromPointer = (clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (deg > 180) deg -= 360;
    const clamped = Math.min(START + SWEEP, Math.max(START, deg));
    const i = Math.round(((clamped - START) / SWEEP) * (stops.length - 1));
    if (stops[i] !== value) onChange(stops[i]);
  };

  return (
    <svg
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Sector count"
      aria-valuemin={stops[0]}
      aria-valuemax={stops[stops.length - 1]}
      aria-valuenow={value}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="mx-auto block size-[184px] cursor-grab touch-none select-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-glow active:cursor-grabbing"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        fromPointer(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          onChange(stops[Math.min(stops.length - 1, index + 1)]);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          onChange(stops[Math.max(0, index - 1)]);
        }
      }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#5ee7ff" />
          <stop offset="1" stopColor="#8b7bff" />
        </linearGradient>
        <radialGradient id={`${gradId}-knob`} cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor="#2a3246" />
          <stop offset="0.6" stopColor="#141a29" />
          <stop offset="1" stopColor="#0b0f1a" />
        </radialGradient>
      </defs>

      {/* track */}
      <path
        d={arcPath(START, START + SWEEP, 78)}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* progress */}
      <path
        d={arcPath(START, Math.max(angle, START + 0.01), 78)}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="4"
        strokeLinecap="round"
        style={{ filter: 'drop-shadow(0 0 6px rgba(94,231,255,0.7))' }}
      />

      {/* ticks + labels */}
      {stops.map((s, i) => {
        const a = angleFor(i);
        const p1 = polar(a, 66);
        const p2 = polar(a, 72);
        const lp = polar(a, 91);
        const on = i <= index;
        return (
          <g key={s}>
            <line
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={on ? '#5ee7ff' : 'rgba(255,255,255,0.25)'}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <text
              x={lp.x}
              y={lp.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="font-mono select-none"
              fontSize="9.5"
              fill={i === index ? '#ffffff' : 'rgba(255,255,255,0.4)'}
            >
              {s}
            </text>
          </g>
        );
      })}

      {/* knob body */}
      <circle cx={C} cy={C} r="56" fill="rgba(0,0,0,0.5)" />
      <circle
        cx={C}
        cy={C}
        r="54"
        fill={`url(#${gradId}-knob)`}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
      />
      <circle
        cx={C}
        cy={C}
        r="44"
        fill="none"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth="1"
        strokeDasharray="2 3"
      />

      {/* needle pointer */}
      <line
        x1={base.x}
        y1={base.y}
        x2={tip.x}
        y2={tip.y}
        stroke="#5ee7ff"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{ filter: 'drop-shadow(0 0 5px rgba(94,231,255,0.9))' }}
      />
      <circle cx={tip.x} cy={tip.y} r="3" fill="#ffffff" />
      <circle cx={C} cy={C} r="5" fill="#5ee7ff" />

      {/* value text in center */}
      <text
        x={C}
        y={C + 16}
        textAnchor="middle"
        className="font-mono font-semibold select-none"
        fontSize="16"
        fill="#ffffff"
      >
        {value}
      </text>
      <text
        x={C}
        y={C + 27}
        textAnchor="middle"
        className="font-mono text-[8px] uppercase tracking-wider select-none"
        fontSize="8"
        fill="rgba(255,255,255,0.4)"
      >
        {label}
      </text>
    </svg>
  );
}
