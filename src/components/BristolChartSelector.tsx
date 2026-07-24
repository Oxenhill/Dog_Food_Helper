'use client';

import { BRISTOL_STOOL_TYPES } from '@/lib/chartReference';

// Text-only chart selector. NO IMAGES — see BUILD_PROGRESS.md: original
// illustrations for the stool-consistency scale haven't been commissioned
// yet, and per architecture doc §4 / legal review §6 the platform must never
// substitute an existing brand's or body's chart artwork in the meantime.
// Swap the label/description rendering below for an <img> per option once
// original artwork exists — the data (`value`) contract stays the same.
export default function BristolChartSelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="border border-gray-200 rounded-lg p-4">
      <legend className="text-sm font-semibold text-gray-900 px-1">
        Stool consistency (Bristol-style, 7-point)
      </legend>
      <p className="text-xs text-gray-500 mb-3">
        Placeholder text descriptions — illustrated chart not yet available. Pick the type that
        best matches.
      </p>
      <div className="grid grid-cols-1 gap-2">
        {BRISTOL_STOOL_TYPES.map((opt) => (
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
              name="stool-score"
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            <div className="font-medium text-gray-900">{opt.label}</div>
            <div className="text-gray-600 mt-1">{opt.description}</div>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
