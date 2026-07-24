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
    <fieldset className="border border-gray-200 rounded-lg p-4">
      <legend className="text-sm font-semibold text-gray-900 px-1">
        {METRIC_TITLES[metric]}
      </legend>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
        {WELLNESS_LEVEL_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`cursor-pointer rounded-lg border p-3 text-sm transition ${
              value === opt.value
                ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600'
                : 'border-gray-200 hover:border-gray-300'
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
            <div className="font-medium text-gray-900">{opt.label}</div>
            <div className="text-gray-600 mt-1">{descriptions[opt.value]}</div>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
