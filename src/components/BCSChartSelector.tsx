'use client';

import { BCS_LEVELS } from '@/lib/chartReference';

// Text-only chart selector. NO IMAGES — see BUILD_PROGRESS.md: original
// illustrations for the 9-point body condition scale haven't been
// commissioned yet. Never substitute WSAVA's (or any other body's) published
// chart artwork here — see architecture doc §4 / legal review §6.
export default function BCSChartSelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="border border-gray-200 rounded-lg p-4">
      <legend className="text-sm font-semibold text-gray-900 px-1">
        Body condition score (9-point)
      </legend>
      <p className="text-xs text-gray-500 mb-3">
        Placeholder text descriptions — illustrated chart not yet available. Assess by rib
        palpability, waist (from above), and abdominal tuck (from the side).
      </p>
      <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto">
        {BCS_LEVELS.map((opt) => (
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
              name="bcs"
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
