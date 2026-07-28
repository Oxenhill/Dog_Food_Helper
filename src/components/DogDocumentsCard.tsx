'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { authHeaders } from '@/lib/clientAuth';

interface DogDocument {
  id: string;
  dog_id: string;
  document_type: 'gut_biome' | 'allergen_test' | 'vet_report' | 'other';
  original_filename: string;
  extracted_text: string;
  lab_name: string | null;
  collected_date: string | null;
  processing_status:
    | 'pending'
    | 'extracted'
    | 'partial'
    | 'needs_review'
    | 'unsupported_lab'
    | 'failed';
  created_at: string;
}

const STATUS_LABELS: Record<DogDocument['processing_status'], string> = {
  pending: 'Text extracted - findings pending review',
  extracted: 'Extracted',
  partial: 'Partially extracted',
  needs_review: 'Needs review',
  unsupported_lab: 'Lab format not supported',
  failed: 'Text extraction failed',
};

export default function DogDocumentsCard({ dogId }: { dogId: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<DogDocument[]>([]);
  const [documentType, setDocumentType] = useState<DogDocument['document_type']>('gut_biome');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/dogs/${dogId}/documents`, {
          headers: authHeaders(),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Could not load documents');
        if (active) setDocuments(body.documents ?? []);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load documents');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [dogId]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setWarning('');
    setNotice('');

    const file = fileInput.current?.files?.[0];
    if (!file) {
      setError('Choose a PDF first.');
      return;
    }

    const form = new FormData();
    form.set('document', file);
    form.set('document_type', documentType);

    setUploading(true);
    try {
      const response = await fetch(`/api/dogs/${dogId}/documents`, {
        method: 'POST',
        headers: authHeaders(),
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not upload the PDF');

      setDocuments((current) => [body.document, ...current]);
      setNotice('PDF stored privately. Extracted text is shown below for you to check.');
      if (body.warning) {
        setWarning(body.warning);
      } else if (body.document.processing_status === 'needs_review') {
        setWarning(
          'Some findings need review. Unattributable chart values were left empty and canonical name suggestions were not auto-accepted.'
        );
      }
      if (fileInput.current) fileInput.current.value = '';
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload the PDF');
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="card card-pad mt-6" aria-labelledby="dog-documents-title">
      <h2 id="dog-documents-title" className="section-title">
        Lab reports &amp; documents
      </h2>
      <p className="lead mt-1">
        PDFs are private to your account. After upload, check the extracted text to see exactly
        what Bowl could read.
      </p>

      <form className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]" onSubmit={upload}>
        <div className="grid gap-3">
          <label className="field">
            <span className="label">Document type</span>
            <select
              className="select"
              value={documentType}
              onChange={(event) =>
                setDocumentType(event.target.value as DogDocument['document_type'])
              }
            >
              <option value="gut_biome">Gut biome report</option>
              <option value="allergen_test">Allergen test</option>
              <option value="vet_report">Vet report</option>
              <option value="other">Other document</option>
            </select>
          </label>
          <label className="field">
            <span className="label">PDF</span>
            <input
              ref={fileInput}
              className="input"
              type="file"
              accept="application/pdf,.pdf"
              required
            />
            <span className="help-text">PDF only, up to 10MB.</span>
          </label>
        </div>
        <button className="btn-primary self-end" type="submit" disabled={uploading}>
          {uploading ? 'Reading PDF...' : 'Upload PDF'}
        </button>
      </form>

      {error && (
        <div className="callout-alarm mt-4" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="callout-info mt-4" role="status">
          {notice}
        </div>
      )}
      {warning && (
        <div className="callout-alarm mt-4" role="alert">
          {warning}
        </div>
      )}

      <div className="hairline mt-6 pt-5">
        <h3 className="font-semibold text-ink">Uploaded documents</h3>
        {loading && <p className="muted mt-2 text-[14px]">Loading documents...</p>}
        {!loading && documents.length === 0 && (
          <p className="muted mt-2 text-[14px]">No documents uploaded yet.</p>
        )}
        <div className="mt-3 grid gap-3">
          {documents.map((document) => (
            <article key={document.id} className="rounded border border-line bg-paper p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink">{document.original_filename}</p>
                  <p className="help-text mt-1">
                    {document.lab_name ?? 'Lab not identified'} ·{' '}
                    {new Date(document.created_at).toLocaleDateString('en-GB')}
                  </p>
                </div>
                {document.processing_status === 'needs_review' ||
                document.processing_status === 'partial' ||
                document.processing_status === 'unsupported_lab' ||
                document.processing_status === 'failed' ? (
                  <span className="callout-alarm px-2 py-1 text-[12px] font-semibold">
                    {STATUS_LABELS[document.processing_status]}
                  </span>
                ) : (
                  <span className="badge-neutral normal-case">
                    {STATUS_LABELS[document.processing_status]}
                  </span>
                )}
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-[13px] font-semibold text-pine">
                  Show extracted text
                </summary>
                {document.extracted_text ? (
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded border border-line bg-surface p-3 font-mono text-[12px] leading-relaxed text-ink-soft">
                    {document.extracted_text}
                  </pre>
                ) : (
                  <p className="error-text mt-2">No text layer could be extracted from this PDF.</p>
                )}
              </details>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
