'use client';

import { WELLNESS_LEVEL_OPTIONS, WELLNESS_INDICATOR_DESCRIPTIONS } from '@/lib/chartReference';

type WellnessMetric = 'coat_condition' | 'stool_odor' | 'gas_frequency' | 'gas_odor';

const METRIC_TITLES: Record<WellnessMetric, string> = {
  coat_condition: 'Coat condition',
  stool_odor: 'Stool odour',
  gas_frequency: 'Gas frequency',
  gas_odor: 'Gas odour',
};

export default function WellnessLevelSelector({
  metric,
  value,
  onChange,
}: {
  metric: WellnessMetric;
  value: 'good' | 'questionable' | 'poor' | null;
  onChange: (value: 'good' | 'questionable' | 'poor') => void;
}) {
  const descriptions = WELLNESS_INDICATOR_DESCRIPTIONS[metric];

  return (
    <fieldset className="rounded-lg border border-line p-4">
      <legend className="label px-1">{METRIC_TITLES[metric]}</legend>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {WELLNESS_LEVEL_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`cursor-pointer rounded-lg border p-3 text-[14px] transition focus-within:border-pine focus-within:shadow-focus ${
              value === opt.value
                ? 'border-pine bg-pine-tint'
                : 'border-line hover:border-line-strong'
            }`}
          >
            <input
              type="radio"
              name={`${metric}-level`}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            <div className="font-medium text-ink">{opt.label}</div>
            <div className="mt-1 text-ink-soft">{descriptions[opt.value]}</div>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
