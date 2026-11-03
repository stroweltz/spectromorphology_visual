import React, { useId, type ReactNode } from 'react';
import { cn } from './utils';

/* ------------------------------------------------------------------ */
/* Group — a titled module in the rack                                 */
/* ------------------------------------------------------------------ */

export function Group({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
        className,
      )}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-white/45">
          {title}
        </h3>
        {aside}
      </header>
      <div className="flex flex-col gap-3.5">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Slider                                                              */
/* ------------------------------------------------------------------ */

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
  disabled,
  bipolar,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
  bipolar?: boolean;
}) {
  const id = useId();
  const safeVal = Number.isFinite(value) ? value : min;
  const pct = Math.max(0, Math.min(100, ((safeVal - min) / (max - min)) * 100));
  const display = format ? format(safeVal) : safeVal.toFixed(2);

  return (
    <div className={cn('group/slider', disabled && 'pointer-events-none opacity-40')}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-[12px] text-white/70">
          {label}
        </label>
        <output
          htmlFor={id}
          className="min-w-12 rounded-md border border-white/[0.07] bg-black/30 px-1.5 py-0.5 text-center font-mono text-[10.5px] tabular-nums text-cyan-glow"
        >
          {display}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className={cn('spectro-range', bipolar && 'is-bipolar')}
        min={min}
        max={max}
        step={step}
        value={safeVal}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--pct' as string]: `${pct}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toggle with LED                                                     */
/* ------------------------------------------------------------------ */

export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="flex items-center gap-2 text-[12.5px] text-white/85 cursor-pointer">
          <span
            aria-hidden
            className={cn(
              'size-1.5 shrink-0 rounded-full transition-all duration-300',
              checked
                ? 'bg-cyan-glow shadow-[0_0_8px_2px_rgba(94,231,255,0.7)]'
                : 'bg-white/15',
            )}
          />
          {label}
        </label>
        {description && (
          <p className="mt-0.5 pl-3.5 text-[11px] leading-snug text-white/40">{description}</p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-glow',
          checked
            ? 'border-cyan-glow/50 bg-gradient-to-r from-cyan-glow/30 to-violet-glow/30 shadow-[0_0_16px_-2px_rgba(94,231,255,0.5)]'
            : 'border-white/10 bg-black/40',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 size-[18px] rounded-full transition-all duration-300',
            checked
              ? 'translate-x-5 bg-gradient-to-br from-white to-cyan-glow shadow-[0_0_10px_rgba(94,231,255,0.8)]'
              : 'translate-x-0 bg-white/40',
          )}
        />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control                                                   */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  columns,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; sub?: string }[];
  onChange: (v: T) => void;
  columns?: number;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1"
      style={{
        gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))`,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'cursor-pointer rounded-lg px-2 py-2 text-center text-[11.5px] font-medium leading-tight transition-all duration-200 focus-visible:outline-2 focus-visible:outline-cyan-glow',
              active
                ? 'bg-gradient-to-b from-white/[0.14] to-white/[0.06] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_0_18px_-4px_rgba(94,231,255,0.5)]'
                : 'text-white/50 hover:bg-white/[0.04] hover:text-white/80',
            )}
          >
            {o.label}
            {o.sub && (
              <span className="mt-0.5 block font-mono text-[9px] font-normal text-white/35">
                {o.sub}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pill button / chip                                                  */
/* ------------------------------------------------------------------ */

export function Pill({
  active,
  onClick,
  children,
  sub,
  className,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  sub?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-cyan-glow',
        active
          ? 'border-transparent bg-gradient-to-r from-cyan-glow to-violet-glow text-[#06101c] shadow-[0_0_20px_-4px_rgba(94,231,255,0.7)] font-semibold'
          : 'border-white/10 bg-white/[0.03] text-white/65 hover:border-white/25 hover:text-white',
        className,
      )}
    >
      {children}
      {sub && <span className="ml-1.5 font-mono text-[10px] opacity-70">{sub}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Color chip                                                          */
/* ------------------------------------------------------------------ */

export function ColorChip({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'group/chip relative flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-black/30 py-1 pl-1 pr-2.5 transition-colors hover:border-white/25 focus-within:outline-2 focus-within:outline-cyan-glow',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      <span
        className="relative size-5 shrink-0 rounded-full border border-white/25 shadow-[0_0_10px_-1px_var(--chip)]"
        style={{ backgroundColor: value, ['--chip' as string]: value }}
      />
      <span className="flex flex-col leading-none">
        <span className="text-[9.5px] text-white/45">{label}</span>
        <span className="mt-0.5 font-mono text-[10px] uppercase text-white/80">{value}</span>
      </span>
      <input
        type="color"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Icon button                                                         */
/* ------------------------------------------------------------------ */

export function IconButton({
  label,
  onClick,
  children,
  active,
  shortcut,
  className,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  shortcut?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        'group/btn relative flex size-9 cursor-pointer items-center justify-center rounded-xl border text-white/70 transition-all duration-200 focus-visible:outline-2 focus-visible:outline-cyan-glow active:scale-95',
        active
          ? 'border-cyan-glow/40 bg-cyan-glow/10 text-cyan-glow shadow-[0_0_18px_-4px_rgba(94,231,255,0.7)]'
          : 'border-white/[0.08] bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.07] hover:text-white',
        className,
      )}
    >
      {children}
    </button>
  );
}
