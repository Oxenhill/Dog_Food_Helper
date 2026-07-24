'use client';

import { useEffect, useState } from 'react';
import { authHeaders } from '@/lib/clientAuth';
import { IngredientReviewQueueItem } from '@/lib/types';

/**
 * Owner-facing photo submission + status list (Phase 5, Part B spec item 5
 * — optional/nice-to-have). Lets an owner upload a packet/ingredient photo
 * (`submitIngredientPhoto`) and see the approval status of everything
 * they've previously submitted for this dog.
 */
export default function IngredientPhotoSubmissions({ dogId }: { dogId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [items, setItems] = useState<IngredientReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadSubmissions() {
    setLoading(true);
    try {
      const res = await fetch(`/api/ingredients/submissions?dog_id=${dogId}`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setItems(json.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSubmissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dogId]);

  async function handleUpload() {
    if (!file) return;
    setUploadState('uploading');
    setUploadMessage('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('dog_id', dogId);

      const res = await fetch('/api/ingredients/submit-photo', {
        method: 'POST',
        headers: authHeaders(), // no Content-Type — browser sets the multipart boundary
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        setUploadState('error');
        setUploadMessage(json.error ?? `Upload failed (${res.status})`);
        return;
      }
      setUploadState('done');
      setUploadMessage(
        json.ocr_warning ??
          `Submitted for review (queue id: ${json.queue_id}). Extracted brand: ${json.extracted?.brand ?? 'unknown'}.`
      );
      setFile(null);
      void loadSubmissions();
    } catch {
      setUploadState('error');
      setUploadMessage('Upload failed — please try again.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="card card-pad">
        <p className="eyebrow">Submit a photo</p>
        <h2 className="section-title mt-1">Food packet photo</h2>
        <p className="lead mt-2">
          Photograph the ingredient list clearly. This goes to a review queue before it's added to
          the food dataset — it's never used automatically.
        </p>
        <div className="field mt-4">
          <label className="label" htmlFor="ingredient-photo-input">
            Photo
          </label>
          <input
            id="ingredient-photo-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="input"
          />
        </div>
        <button
          type="button"
          disabled={!file || uploadState === 'uploading'}
          onClick={() => void handleUpload()}
          className="btn-primary mt-4"
        >
          {uploadState === 'uploading' ? 'Uploading…' : 'Submit photo'}
        </button>
        {uploadMessage && (
          <div
            className={uploadState === 'error' ? 'callout-alarm mt-4' : 'callout-info mt-4'}
            role={uploadState === 'error' ? 'alert' : undefined}
          >
            {uploadMessage}
          </div>
        )}
      </div>

      <div>
        <h2 className="section-title">Your submissions</h2>
        {loading && <p className="muted mt-3 text-[14px]">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="muted mt-3 text-[14px]">No submissions yet.</p>
        )}
        <ul className="mt-3 flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id} className="card card-pad flex items-center justify-between gap-3">
              <div>
                <p className="text-[14px] font-semibold text-ink">
                  {item.raw_ocr_json.brand ?? 'Unknown brand'} —{' '}
                  {item.raw_ocr_json.product_name ?? 'Unknown product'}
                </p>
                <p className="metric mt-1 text-[12px] text-ink-soft">
                  Submitted {new Date(item.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span
                  className={
                    item.status === 'approved'
                      ? 'signal-better'
                      : item.status === 'rejected'
                        ? 'signal-worse'
                        : 'badge-neutral'
                  }
                >
                  {item.status}
                </span>
                {item.reviewed_at && (
                  <span className="metric text-[11px] text-ink-soft">
                    {new Date(item.reviewed_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
