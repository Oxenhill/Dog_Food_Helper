'use client';

import { BRISTOL_STOOL_TYPES } from '@/lib/chartReference';
import { useChartIllustrations } from '@/lib/useChartIllustrations';

// Renders an uploaded original illustration per option when one exists
// (via /admin/charts, see src/lib/chartIllustrationStorage.ts), falling back
// to text-only otherwise — see BUILD_PROGRESS.md. Per architecture doc §4 /
// legal review §6, only ORIGINAL illustrations may ever be uploaded; the
// platform must never substitute an existing brand's or body's chart
// artwork. The data (`value`) contract is unchanged either way.
export default function BristolChartSelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number) => void;
}) {
  const illustrations = useChartIllustrations();

  return (
    <fieldset className="border border-gray-200 rounded-lg p-4">
      <legend className="text-sm font-semibold text-gray-900 px-1">
        Stool consistency (Bristol-style, 7-point)
      </legend>
      <p className="text-xs text-gray-500 mb-3">Pick the type that best matches.</p>
      <div className="grid grid-cols-1 gap-2">
        {BRISTOL_STOOL_TYPES.map((opt) => {
          const imageUrl = illustrations.bristol[String(opt.value)];
          return (
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
              {imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt={opt.label}
                  className="max-h-24 mb-2 rounded"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <div className="font-medium text-gray-900">{opt.label}</div>
              <div className="text-gray-600 mt-1">{opt.description}</div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
