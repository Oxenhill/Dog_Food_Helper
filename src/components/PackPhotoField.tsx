'use client';

import { useEffect, useState } from 'react';
import {
  prepareImageForUpload,
  type CropInsets,
  type ImageQualityIssue,
} from '@/lib/clientImageResize';

interface PackPhotoFieldProps {
  id: string;
  label: string;
  help: string;
  onReady: (file: File | null) => void;
}

const EMPTY_CROP: CropInsets = { left: 0, right: 0, top: 0, bottom: 0 };

export default function PackPhotoField({
  id,
  label,
  help,
  onReady,
}: PackPhotoFieldProps) {
  const [source, setSource] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [crop, setCrop] = useState<CropInsets>(EMPTY_CROP);
  const [issues, setIssues] = useState<ImageQualityIssue[]>([]);
  const [candidate, setCandidate] = useState<File | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!source) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(source);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);

  function clearPrepared() {
    setCandidate(null);
    setIssues([]);
    setReady(false);
    setError('');
    onReady(null);
  }

  function chooseFile(file: File | null) {
    setSource(file);
    setCrop(EMPTY_CROP);
    clearPrepared();
  }

  function changeCrop(edge: keyof CropInsets, value: number) {
    setCrop((current) => ({ ...current, [edge]: value }));
    clearPrepared();
  }

  async function checkPhoto() {
    if (!source) return;
    setBusy(true);
    setError('');
    setCandidate(null);
    setReady(false);
    onReady(null);
    try {
      const prepared = await prepareImageForUpload(source, crop);
      setIssues(prepared.issues);
      const blocked = prepared.issues.some((issue) => issue.severity === 'block');
      if (blocked) return;

      setCandidate(prepared.file);
      const warned = prepared.issues.some((issue) => issue.severity === 'warning');
      if (!warned) {
        setReady(true);
        onReady(prepared.file);
      }
    } catch {
      setError('We could not prepare this image. Choose another photo or retake it.');
    } finally {
      setBusy(false);
    }
  }

  function acceptWarning() {
    if (!candidate) return;
    setReady(true);
    onReady(candidate);
  }

  return (
    <div className="field rounded-xl border border-line p-4">
      <label className="label" htmlFor={id}>{label} (required)</label>
      <p className="help-text mb-3">{help}</p>
      <input
        id={id}
        className="input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
      />

      {source && previewUrl && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-ink">Crop to the useful part</p>
          <p className="help-text mt-1">
            Keep all printed text inside the green box. Trim away the floor, table, or empty packet.
          </p>

          <div className="relative mx-auto mt-3 w-full max-w-md overflow-hidden rounded-lg bg-ink/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="" className="block max-h-80 w-full object-contain" />
            <div
              className="pointer-events-none absolute border-2 border-emerald-500 shadow-[0_0_0_9999px_rgba(15,23,42,0.42)]"
              style={{
                left: `${crop.left}%`,
                right: `${crop.right}%`,
                top: `${crop.top}%`,
                bottom: `${crop.bottom}%`,
              }}
              aria-hidden="true"
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(
              [
                ['left', 'Trim left'],
                ['right', 'Trim right'],
                ['top', 'Trim top'],
                ['bottom', 'Trim bottom'],
              ] as const
            ).map(([edge, edgeLabel]) => (
              <label key={edge} className="text-sm text-ink">
                <span className="flex justify-between gap-2">
                  <span>{edgeLabel}</span>
                  <span className="metric text-ink-soft">{crop[edge]}%</span>
                </span>
                <input
                  className="mt-1 w-full accent-emerald-700"
                  type="range"
                  min="0"
                  max="45"
                  step="1"
                  value={crop[edge]}
                  onChange={(event) => changeCrop(edge, Number(event.target.value))}
                />
              </label>
            ))}
          </div>

          <button
            type="button"
            className="btn-secondary mt-4"
            disabled={busy}
            onClick={() => void checkPhoto()}
          >
            {busy ? 'Checking photo…' : ready ? 'Check crop again' : 'Use this crop'}
          </button>

          {issues.length > 0 && (
            <div className="mt-3 flex flex-col gap-2" aria-live="polite">
              {issues.map((issue) => (
                <div
                  key={issue.code}
                  className={issue.severity === 'block' ? 'callout-alarm' : 'callout-disclaimer'}
                >
                  {issue.message}
                </div>
              ))}
            </div>
          )}

          {candidate &&
            !ready &&
            issues.some((issue) => issue.severity === 'warning') &&
            !issues.some((issue) => issue.severity === 'block') && (
              <button type="button" className="btn-secondary mt-3" onClick={acceptWarning}>
                The text is clear to me — use it
              </button>
            )}

          {ready && (
            <p className="mt-3 text-sm font-semibold text-emerald-800" role="status">
              Photo ready
            </p>
          )}
          {error && <div className="callout-alarm mt-3">{error}</div>}
        </div>
      )}
    </div>
  );
}
