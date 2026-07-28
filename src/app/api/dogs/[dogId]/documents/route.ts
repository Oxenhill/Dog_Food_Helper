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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a PDF upload' }, { status: 400 });
  }

  const file = formData.get('document');
  const documentTypeValue = formData.get('document_type');
  const documentType =
    typeof documentTypeValue === 'string' ? documentTypeValue.trim() : 'other';

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A PDF file is required' }, { status: 400 });
  }
  if (!DOCUMENT_TYPES.has(documentType)) {
    return NextResponse.json({ error: 'Unsupported document type' }, { status: 400 });
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'The uploaded PDF is empty' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'PDF exceeds the 10MB upload limit' }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'PDF exceeds the 10MB upload limit' }, { status: 413 });
  }
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
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

  const documentId = randomUUID();
  const storagePath = `${user.id}/${params.dogId}/${documentId}.pdf`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (uploadError) {
    console.error('dog documents: storage upload failed', uploadError);
    return NextResponse.json({ error: 'Could not store the PDF' }, { status: 500 });
  }

  const { data, error: insertError } = await supabaseAdmin
    .from('dog_documents')
    .insert({
      id: documentId,
      dog_id: params.dogId,
      owner_id: user.id,
      document_type: documentType,
      original_filename: file.name,
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
      console.error('dog documents: findings insert failed', findingsError);
      await supabaseAdmin
        .from('dog_documents')
        .update({ processing_status: 'needs_review' })
        .eq('id', documentId)
        .eq('owner_id', user.id);
      data.processing_status = 'needs_review';
      return NextResponse.json(
        {
          document: data,
          warning: 'The PDF was stored, but its findings need review.',
        },
        { status: 201 }
      );
    }
  }

  return NextResponse.json(
    {
      document: data,
      finding_count: parseResult?.findings.length ?? 0,
      unavailable_fields: parseResult?.unavailable_fields ?? [],
      taxonomy_suggestions: parseResult?.taxonomy_suggestions ?? [],
    },
    { status: 201 }
  );
}
