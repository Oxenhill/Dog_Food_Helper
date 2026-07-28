import { PDFParse } from 'pdf-parse';

export interface ExtractedPdfPage {
  num: number;
  text: string;
}

export interface ExtractedPdfText {
  text: string;
  pages: ExtractedPdfPage[];
  totalPages: number;
}

/**
 * Deterministic PDF text-layer extraction. No model receives the PDF or its
 * text. Callers decide which reduced, literal excerpts are safe to inspect.
 */
export async function extractPdfText(data: Uint8Array): Promise<ExtractedPdfText> {
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return {
      text: result.text,
      pages: result.pages.map((page) => ({ num: page.num, text: page.text })),
      totalPages: result.total,
    };
  } finally {
    await parser.destroy();
  }
}
