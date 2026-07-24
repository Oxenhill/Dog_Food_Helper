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
    <div className="space-y-6">
      <div className="border border-gray-300 rounded-xl p-4 space-y-3">
        <h2 className="font-bold text-lg">Submit a food packet photo</h2>
        <p className="text-sm text-gray-600">
          Photograph the ingredient list clearly. This goes to a review queue before it's added to
          the food dataset — it's never used automatically.
        </p>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <div>
          <button
            type="button"
            disabled={!file || uploadState === 'uploading'}
            onClick={() => void handleUpload()}
            className="bg-gray-800 disabled:bg-gray-300 text-white rounded-lg px-4 py-2 text-sm"
          >
            {uploadState === 'uploading' ? 'Uploading…' : 'Submit photo'}
          </button>
        </div>
        {uploadMessage && (
          <p className={`text-sm ${uploadState === 'error' ? 'text-red-600' : 'text-green-700'}`}>
            {uploadMessage}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="font-bold text-lg">Your submissions</h2>
        {loading && <p className="text-sm text-gray-500">Loading…</p>}
        {!loading && items.length === 0 && <p className="text-sm text-gray-500">No submissions yet.</p>}
        {items.map((item) => (
          <div key={item.id} className="border border-gray-200 rounded-lg p-3 text-sm flex justify-between">
            <div>
              <div className="font-medium">
                {item.raw_ocr_json.brand ?? 'Unknown brand'} — {item.raw_ocr_json.product_name ?? 'Unknown product'}
              </div>
              <div className="text-gray-500">Submitted {new Date(item.created_at).toLocaleDateString()}</div>
            </div>
            <div className="text-right">
              <span
                className={
                  item.status === 'approved'
                    ? 'text-green-700 font-medium'
                    : item.status === 'rejected'
                      ? 'text-red-600 font-medium'
                      : 'text-amber-600 font-medium'
                }
              >
                {item.status}
              </span>
              {item.reviewed_at && (
                <div className="text-gray-400 text-xs">{new Date(item.reviewed_at).toLocaleDateString()}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
