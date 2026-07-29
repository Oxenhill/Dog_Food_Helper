'use client';

import { BRISTOL_STOOL_TYPES } from '@/lib/chartReference';
import { useChartIllustrations } from '@/lib/useChartIllustrations';

export default function BristolMultiChartSelector({
  values,
  onChange,
}: {
  values: number[];
  onChange: (values: number[]) => void;
}) {
  const illustrations = useChartIllustrations();

  function toggle(value: number) {
    onChange(
      values.includes(value)
        ? values.filter((current) => current !== value)
        : [...values, value].sort((a, b) => a - b)
    );
  }

  return (
    <fieldset className="rounded-lg border border-line p-4">
      <legend className="label px-1">Usual stool consistency</legend>
      <p className="help-text mb-3">
        Select every type that is normal for your dog. A typical day can include more than one.
      </p>
      <div className="grid grid-cols-1 gap-2">
        {BRISTOL_STOOL_TYPES.map((option) => {
          const selected = values.includes(option.value);
          const imageUrl = illustrations.bristol[String(option.value)];
          return (
            <label
              key={option.value}
              className={`cursor-pointer rounded-lg border p-3 text-[14px] transition focus-within:border-pine focus-within:shadow-focus ${
                selected ? 'border-pine bg-pine-tint' : 'border-line hover:border-line-strong'
              }`}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggle(option.value)}
                className="sr-only"
              />
              {imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt={option.label}
                  className="mb-2 max-h-24 rounded"
                  onError={(event) => {
                    (event.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <div className="font-medium text-ink">
                {selected ? '✓ ' : ''}
                {option.label}
              </div>
              <div className="mt-1 text-ink-soft">{option.description}</div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
