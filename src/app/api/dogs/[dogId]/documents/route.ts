import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { extractPdfText } from '@/lib/pdfText';
import {
  isBiome4PetsDocument,
  parseBiome4Pets,
  type Biome4PetsParseResult,
} from '@/lib/biome4PetsParser';

export const runtime = 'nodejs';

const BUCKET = 'dog-documents';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DOCUMENT_TYPES = new Set(['gut_biome', 'allergen_test', 'vet_report', 'other']);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface PrepareUploadRequest {
  action: 'prepare';
  document_type: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
}

interface FinalizeUploadRequest {
  action: 'finalize';
  document_id: string;
  document_type: string;
  original_filename: string;
}

async function ownedDog(dogId: string, ownerId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('dogs')
    .select('id')
    .eq('id', dogId)
    .eq('owner_id', ownerId)
    .maybeSingle();
  return !error && Boolean(data);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { dogId: string } }
) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await ownedDog(params.dogId, user.id))) {
    return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from('dog_documents')
    .select(
      'id, dog_id, document_type, original_filename, extracted_text, lab_name, collected_date, processing_status, created_at'
    )
    .eq('dog_id', params.dogId)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('dog documents: list failed', error);
    return NextResponse.json({ error: 'Could not load documents' }, { status: 500 });
  }

  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { dogId: string } }
) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!(await ownedDog(params.dogId, user.id))) {
    return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
  }

  let body: PrepareUploadRequest | FinalizeUploadRequest;
  try {
    body = (await request.json()) as PrepareUploadRequest | FinalizeUploadRequest;
  } catch {
    return NextResponse.json({ error: 'Expected upload metadata as JSON' }, { status: 400 });
  }

  const documentType =
    typeof body.document_type === 'string' ? body.document_type.trim() : '';
  const originalFilename =
    typeof body.original_filename === 'string' ? body.original_filename.trim() : '';

  if (!DOCUMENT_TYPES.has(documentType)) {
    return NextResponse.json({ error: 'Unsupported document type' }, { status: 400 });
  }
  if (!originalFilename || !originalFilename.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'A PDF filename is required' }, { status: 400 });
  }

  if (body.action === 'prepare') {
    if (
      !Number.isSafeInteger(body.file_size) ||
      body.file_size <= 0 ||
      body.file_size > MAX_UPLOAD_BYTES
    ) {
      return NextResponse.json(
        {
          error:
            body.file_size > MAX_UPLOAD_BYTES
              ? 'PDF exceeds the 10MB upload limit'
              : 'The uploaded PDF is empty',
        },
        { status: body.file_size > MAX_UPLOAD_BYTES ? 413 : 400 }
      );
    }
    if (body.mime_type && body.mime_type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 });
    }

    const documentId = randomUUID();
    const storagePath = `${user.id}/${params.dogId}/${documentId}.pdf`;
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath, { upsert: false });

    if (error || !data) {
      console.error('dog documents: signed upload preparation failed', error);
      return NextResponse.json({ error: 'Could not prepare the private upload' }, { status: 500 });
    }

    return NextResponse.json({
      document_id: documentId,
      storage_path: storagePath,
      upload_token: data.token,
    });
  }

  if (body.action !== 'finalize') {
    return NextResponse.json({ error: 'Unsupported upload action' }, { status: 400 });
  }

  if (!UUID_PATTERN.test(body.document_id)) {
    return NextResponse.json({ error: 'Invalid document id' }, { status: 400 });
  }

  const documentId = body.document_id;
  const storagePath = `${user.id}/${params.dogId}/${documentId}.pdf`;
  const { data: existing } = await supabaseAdmin
    .from('dog_documents')
    .select(
      'id, dog_id, document_type, original_filename, extracted_text, lab_name, collected_date, processing_status, created_at'
    )
    .eq('id', documentId)
    .eq('dog_id', params.dogId)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ document: existing, already_finalized: true });
  }

  const { data: storedFile, error: downloadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(storagePath);
  if (downloadError || !storedFile) {
    console.error('dog documents: uploaded PDF download failed', downloadError);
    return NextResponse.json({ error: 'The private PDF upload could not be found' }, { status: 400 });
  }

  const buffer = Buffer.from(await storedFile.arrayBuffer());
  if (buffer.length === 0) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: 'The uploaded PDF is empty' }, { status: 400 });
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: 'PDF exceeds the 10MB upload limit' }, { status: 413 });
  }
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: 'File does not have a valid PDF header' }, { status: 400 });
  }

  let extractedText = '';
  let labName: string | null = null;
  let processingStatus:
    | 'pending'
    | 'extracted'
    | 'needs_review'
    | 'unsupported_lab'
    | 'failed' = 'pending';
  let parseResult: Biome4PetsParseResult | null = null;
  try {
    const extracted = await extractPdfText(new Uint8Array(buffer));
    extractedText = extracted.text;
    if (!extractedText.trim()) {
      processingStatus = 'failed';
    } else if (isBiome4PetsDocument(extractedText)) {
      parseResult = parseBiome4Pets(extracted);
      labName = parseResult.lab_name;
      processingStatus = parseResult.processing_status;
    } else if (documentType === 'gut_biome') {
      processingStatus = 'unsupported_lab';
    }
  } catch (error) {
    console.error('dog documents: PDF text extraction failed', error);
    processingStatus = 'failed';
  }

  const { data, error: insertError } = await supabaseAdmin
    .from('dog_documents')
    .insert({
      id: documentId,
      dog_id: params.dogId,
      owner_id: user.id,
      document_type: documentType,
      original_filename: originalFilename,
      storage_path: storagePath,
      extracted_text: extractedText,
      lab_name: labName,
      collected_date: null,
      processing_status: processingStatus,
    })
    .select(
      'id, dog_id, document_type, original_filename, extracted_text, lab_name, collected_date, processing_status, created_at'
    )
    .single();

  if (insertError || !data) {
    console.error('dog documents: row insert failed', insertError);
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: 'Could not record the document' }, { status: 500 });
  }

  let findingsStored = true;
  let sourceFileDeleted = false;
  let warning: string | null = null;

  if (parseResult && parseResult.findings.length > 0) {
    const { error: findingsError } = await supabaseAdmin.from('dog_document_findings').insert(
      parseResult.findings.map((finding) => ({
        document_id: documentId,
        dog_id: params.dogId,
        owner_id: user.id,
        ...finding,
      }))
    );

    if (findingsError) {
      findingsStored = false;
      console.error('dog documents: findings insert failed', findingsError);
      await supabaseAdmin
        .from('dog_documents')
        .update({ processing_status: 'needs_review' })
        .eq('id', documentId)
        .eq('owner_id', user.id);
      data.processing_status = 'needs_review';
      warning = 'The PDF was retained privately because its findings could not be stored.';
    }
  }

  if (parseResult && findingsStored) {
    const { error: removalError } = await supabaseAdmin.storage
      .from(BUCKET)
      .remove([storagePath]);

    if (removalError) {
      console.error('dog documents: temporary source PDF removal failed', removalError);
      warning = 'The report was processed, but its temporary source file needs cleanup.';
    } else {
      sourceFileDeleted = true;
      const { error: cleanupRecordError } = await supabaseAdmin
        .from('dog_documents')
        .update({
          storage_path: null,
          source_file_deleted_at: new Date().toISOString(),
        })
        .eq('id', documentId)
        .eq('owner_id', user.id);
      if (cleanupRecordError) {
        console.error('dog documents: source PDF deletion record failed', cleanupRecordError);
        warning = 'The report was processed and its source file deleted, but cleanup metadata failed.';
      }
    }
  }

  return NextResponse.json(
    {
      document: data,
      finding_count: parseResult?.findings.length ?? 0,
      unavailable_fields: parseResult?.unavailable_fields ?? [],
      taxonomy_suggestions: parseResult?.taxonomy_suggestions ?? [],
      source_file_deleted: sourceFileDeleted,
      ...(warning ? { warning } : {}),
    },
    { status: 201 }
  );
}
