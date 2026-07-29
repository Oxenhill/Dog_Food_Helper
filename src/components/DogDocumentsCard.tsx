'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { authHeaders } from '@/lib/clientAuth';

interface DogDocumentFinding {
  id: string;
  document_id: string;
  finding_type: string;
  marker_name: string;
  value: string | number | null;
  unit: string | null;
  reference_range: string | null;
  interpretation_flag: string | null;
  source_kind: string;
  review_status: 'accepted' | 'needs_review';
  verbatim_source_text: string;
  created_at: string;
}

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
  findings: DogDocumentFinding[];
}

const STATUS_LABELS: Record<DogDocument['processing_status'], string> = {
  pending: 'Reading report',
  extracted: 'Findings extracted',
  partial: 'Usable findings extracted; uncertain items excluded',
  needs_review: 'Storage problem',
  unsupported_lab: 'Lab format not supported',
  failed: 'Text extraction failed',
};

async function responseBody(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, any>;
  } catch {
    return {
      error:
        response.status === 413
          ? 'This PDF is too large for the application upload route.'
          : `Upload service returned an unreadable response (${response.status}).`,
    };
  }
}

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

    setUploading(true);
    try {
      const prepareResponse = await fetch(`/api/dogs/${dogId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          action: 'prepare',
          document_type: documentType,
          original_filename: file.name,
          file_size: file.size,
          mime_type: file.type || 'application/pdf',
        }),
      });
      const prepareBody = await responseBody(prepareResponse);
      if (!prepareResponse.ok) {
        throw new Error(prepareBody.error ?? 'Could not prepare the private upload');
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Private document storage is not configured.');
      }

      const storageClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: storageError } = await storageClient.storage
        .from('dog-documents')
        .uploadToSignedUrl(
          String(prepareBody.storage_path),
          String(prepareBody.upload_token),
          file,
          { contentType: 'application/pdf' }
        );
      if (storageError) {
        console.error('dog documents: direct storage upload failed', storageError);
        throw new Error('Could not upload the PDF to private storage.');
      }

      const finalizeResponse = await fetch(`/api/dogs/${dogId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          action: 'finalize',
          document_id: prepareBody.document_id,
          document_type: documentType,
          original_filename: file.name,
        }),
      });
      const body = await responseBody(finalizeResponse);
      if (!finalizeResponse.ok) {
        throw new Error(body.error ?? 'Could not process the uploaded PDF');
      }

      setDocuments((current) => [body.document, ...current]);
      setNotice(
        body.source_file_deleted
          ? 'Report processed privately. The source PDF was deleted after extraction; the extracted text is shown below for you to check.'
          : 'PDF stored privately. Extracted text is shown below for you to check.'
      );
      if (body.warning) {
        setWarning(body.warning);
      } else if (body.document.processing_status === 'partial') {
        setWarning(
          'Exact findings are already available to Bowl. Uncertain or misspelled items were excluded rather than guessed.'
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
        PDFs are uploaded privately and deleted after successful extraction. Exact findings become
        part of your dog&apos;s profile automatically; uncertain items are excluded rather than sent
        to an admin queue.
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

              {document.findings?.length > 0 && (
                <div className="mt-4 grid gap-3">
                  <p className="eyebrow">Profile findings</p>
                  {document.findings.map((finding) => {
                    const isUsed = finding.review_status === 'accepted';
                    const renderedValue = [finding.value, finding.unit]
                      .filter((value) => value !== null && value !== '')
                      .join(' ');
                    return (
                      <div
                        key={finding.id}
                        className={`rounded border p-3 ${
                          isUsed
                            ? 'border-pine/30 bg-pine-tint/30'
                            : 'border-line bg-surface'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-ink">{finding.marker_name}</p>
                            <p className="mt-1 text-[13px] text-ink-soft">
                              {renderedValue || 'Recorded without a numeric value'}
                              {finding.interpretation_flag
                                ? ` · ${finding.interpretation_flag.replace(/_/g, ' ')}`
                                : ''}
                            </p>
                          </div>
                          <span className={isUsed ? 'signal-better' : 'badge-neutral'}>
                            {isUsed ? 'Used in profile' : 'Excluded — uncertain'}
                          </span>
                        </div>
                        <p className="help-text mt-2">
                          Source: “{finding.verbatim_source_text}”
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

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
