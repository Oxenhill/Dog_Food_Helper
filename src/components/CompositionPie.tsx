/**
 * Guaranteed-analysis composition — part-to-whole, six segments.
 *
 * WHY A PIE IS LEGITIMATE HERE (the `dataviz` skill's own rule): the pie
 * anti-pattern is using one to COMPARE close values across many categories.
 * This is the allowed case — part-to-whole at a glance with <= 6 segments that
 * genuinely sum to the whole. A guaranteed-analysis panel is exactly six
 * fractions (protein, fat, fibre, moisture, ash, and carbohydrate by
 * difference) totalling 100%.
 *
 * WHAT IS DELIBERATELY *NOT* PIED: the ingredient list. 20-40 items is far past
 * the ~7-class ceiling, and label order implies inclusion without stating it —
 * a pie there would invent quantities the label never printed. Ingredients get
 * an ordered list instead.
 *
 * PALETTE: the six categorical hues below were validated with the skill's
 * `scripts/validate_palette.js` (light mode) -> ALL CHECKS PASS, with one
 * non-dismissable WARN: contrast vs surface below 3:1 for the aqua, yellow and
 * magenta slots. A contrast WARN obligates visible labels or a table view, so
 * every segment is directly labelled with its name and value in the keyed
 * table beside the chart, and large segments carry their value on the mark
 * too. Identity is therefore never colour-alone. Do not drop those labels, and
 * re-run the validator against the dark surface before adding a dark mode.
 *
 * Hues are assigned to fixed slots and never cycled or re-ordered — protein is
 * always blue, fat is always orange, regardless of which fractions are present.
 *
 * Dependency-free inline SVG on purpose: no charting library, no new
 * node_modules (this checkout has a recurring install-corruption problem), and
 * the app stays portable.
 */

'use client';

import { useId } from 'react';
import type { FoodNutrients } from '@/lib/foodFull';

/** Surface colour from tailwind.config.ts — the 2px inter-segment gap is drawn in it. */
const SURFACE = '#FCFBF8';
const INK = '#23221F';

interface Slot {
  key: string;
  label: string;
  color: string;
  /** Shown under the label when the figure needs a caveat. */
  caveat?: string;
}

/**
 * Fixed slot order. Colour follows the fraction, never its size or rank — a
 * food with more fat than protein must not repaint the segments.
 */
const SLOTS: Slot[] = [
  { key: 'protein_pct', label: 'Protein', color: '#2a78d6' },
  { key: 'fat_pct', label: 'Fat / oils', color: '#eb6834' },
  {
    key: 'est_digestible_carbohydrate_pct',
    label: 'Carbohydrate',
    color: '#1baf7a',
    caveat: 'estimated by difference',
  },
  { key: 'fibre_pct', label: 'Crude fibre', color: '#eda100' },
  { key: 'moisture_pct', label: 'Moisture', color: '#e87ba4' },
  { key: 'ash_pct', label: 'Ash / minerals', color: '#008300' },
];

/** WCAG relative luminance, used to pick white-or-ink for a label set on a fill. */
function luminance(hex: string): number {
  const v = hex.replace('#', '');
  const channel = (h: string) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = channel(v.slice(0, 2));
  const g = channel(v.slice(2, 4));
  const b = channel(v.slice(4, 6));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Label colour inside a filled segment: whichever of white/ink actually clears contrast. */
function onFillColor(fill: string): string {
  const l = luminance(fill);
  return contrast(l, 1) >= contrast(l, luminance(INK)) ? '#FFFFFF' : INK;
}

const CX = 110;
const CY = 110;
const R = 100;
/** A segment smaller than this can't hold a value legibly — the table carries it. */
const MIN_PCT_FOR_INLINE_LABEL = 8;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(startAngle: number, endAngle: number): string {
  const start = polar(CX, CY, R, startAngle);
  const end = polar(CX, CY, R, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${R} ${R} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`;
}

interface Segment {
  slot: Slot;
  value: number;
  pct: number;
  startAngle: number;
  endAngle: number;
}

export interface CompositionPieProps {
  nutrients: FoodNutrients;
}

/**
 * Returns null when the panel is incomplete.
 *
 * This is deliberate and load-bearing: carbohydrate is derived by difference,
 * so if any of the five printed fractions is missing the six values do not sum
 * to the whole and a part-to-whole chart would misstate the food. An absent
 * chart is honest; an empty or partial circle is not.
 */
export default function CompositionPie({ nutrients }: CompositionPieProps) {
  const titleId = useId();

  const values = SLOTS.map((slot) => ({
    slot,
    value: (nutrients as unknown as Record<string, number | null>)[slot.key],
  }));

  // Every slot must be present. est_digestible_carbohydrate_pct is itself null
  // whenever the printed panel is incomplete, so this one check covers both.
  if (values.some((v) => typeof v.value !== 'number' || !Number.isFinite(v.value))) {
    return null;
  }

  const present = values as { slot: Slot; value: number }[];
  const total = present.reduce((sum, v) => sum + v.value, 0);
  if (total <= 0) return null;

  // Label fractions are rounded on the packet, so they can sum to slightly over
  // 100. Angles are taken from the actual total rather than assuming 100, and
  // the discrepancy is disclosed rather than silently normalised away.
  const printedBaseTotal = present
    .filter((p) => p.slot.key !== 'est_digestible_carbohydrate_pct')
    .reduce((sum, p) => sum + p.value, 0);
  const overSubscribed = printedBaseTotal > 100.05;

  let cursor = 0;
  const segments: Segment[] = present.map(({ slot, value }) => {
    const pct = (value / total) * 100;
    const startAngle = cursor;
    const endAngle = cursor + (value / total) * 360;
    cursor = endAngle;
    return { slot, value, pct, startAngle, endAngle };
  });

  const drawable = segments.filter((s) => s.endAngle - s.startAngle > 0.01);
  const isSingleFullSlice = drawable.length === 1;

  const summary = segments
    .map((s) => `${s.slot.label} ${s.value.toFixed(1)}%`)
    .join(', ');

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
      <svg
        viewBox="0 0 220 220"
        role="img"
        aria-labelledby={titleId}
        className="h-[180px] w-[180px] shrink-0 self-center sm:h-[200px] sm:w-[200px]"
      >
        <title id={titleId}>{`Composition by weight: ${summary}`}</title>
        {isSingleFullSlice ? (
          <circle cx={CX} cy={CY} r={R} fill={drawable[0].slot.color} />
        ) : (
          drawable.map((s) => (
            <path
              key={s.slot.key}
              d={slicePath(s.startAngle, s.endAngle)}
              fill={s.slot.color}
              // The separator is a 2px gap in the SURFACE colour, not an ink
              // border — white does the separating, per the mark specs.
              stroke={SURFACE}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          ))
        )}
        {/* Values ride the mark only where they genuinely fit; the table below
            carries every value, so nothing is gated behind segment size. */}
        {drawable
          .filter((s) => s.pct >= MIN_PCT_FOR_INLINE_LABEL)
          .map((s) => {
            const mid = (s.startAngle + s.endAngle) / 2;
            const p = polar(CX, CY, R * 0.62, mid);
            return (
              <text
                key={`label-${s.slot.key}`}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={onFillColor(s.slot.color)}
                className="font-mono"
                fontSize={13}
                fontWeight={600}
              >
                {s.value.toFixed(0)}%
              </text>
            );
          })}
      </svg>

      <div className="min-w-0 flex-1">
        <table className="w-full text-[13px]">
          <caption className="sr-only">Composition by weight, percentage of total</caption>
          <tbody>
            {segments.map((s) => (
              <tr key={s.slot.key} className="align-baseline">
                <td className="py-1 pr-2 w-0">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: s.slot.color }}
                  />
                </td>
                <th scope="row" className="py-1 pr-3 text-left font-normal text-ink">
                  {s.slot.label}
                  {s.slot.caveat && (
                    <span className="muted block text-[11.5px] leading-tight">{s.slot.caveat}</span>
                  )}
                </th>
                <td className="metric py-1 text-right font-semibold text-ink">
                  {s.value.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {overSubscribed && (
          <p className="help-text mt-2">
            The printed fractions add up to more than 100%, so these shares are approximate. This
            usually means the label rounds its figures.
          </p>
        )}
      </div>
    </div>
  );
}
