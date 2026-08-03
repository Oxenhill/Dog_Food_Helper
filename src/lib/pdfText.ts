import { DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import { PDFParse } from 'pdf-parse';
// @ts-expect-error -- no type declarations for this pdfjs-dist subpath; the
// module itself (WorkerMessageHandler) is what we need, not its types.
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

/**
 * pdf-parse bundles pdfjs-dist, whose worker (pdf.worker.mjs) tries to
 * self-polyfill `DOMMatrix`/`Path2D`/`ImageData` onto `globalThis` for Node by
 * dynamically `require()`-ing `@napi-rs/canvas` (already pdf-parse's own
 * dependency) the first time it needs one. That self-polyfill is wrapped in a
 * try/catch that silently logs a warning and moves on if the require fails --
 * it does not throw. Confirmed live 2026-08-03: a PDF with vector-graphics
 * content (figures/charts in an uploaded research paper) hit that code path,
 * the self-polyfill silently no-op'd, and the *next* line to call
 * `new DOMMatrix(...)` directly against the (still unset) global threw
 * "DOMMatrix is not defined" -- while simpler PDFs that never exercise that
 * canvas-drawing code path continued to work fine, and the same file
 * succeeded on a later attempt (the self-polyfill is not fully deterministic).
 * Setting the globals ourselves, once, removes the dependency on that
 * internal timing/context-sensitive mechanism entirely.
 */
if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix === 'undefined') {
  (globalThis as { DOMMatrix?: unknown }).DOMMatrix = DOMMatrix;
}
if (typeof (globalThis as { Path2D?: unknown }).Path2D === 'undefined') {
  (globalThis as { Path2D?: unknown }).Path2D = Path2D;
}
if (typeof (globalThis as { ImageData?: unknown }).ImageData === 'undefined') {
  (globalThis as { ImageData?: unknown }).ImageData = ImageData;
}

/**
 * pdfjs-dist has no real Worker thread available in a Vercel serverless
 * function, so it falls back to a "fake worker" that runs in-process. That
 * fallback resolves its module with `import(GlobalWorkerOptions.workerSrc)`
 * -- a runtime string, not a static path -- so Vercel's output file tracing
 * (which only follows statically-analyzable imports) does not know to bundle
 * `pdf.worker.mjs` into the function, and the dynamic import throws "Cannot
 * find module .../pdfjs-dist/legacy/build/pdf.worker.mjs" the first time a
 * cold-started instance needs it. Confirmed live 2026-08-03 on an 8MB
 * image-heavy brochure upload; smaller PDFs had it happen to hit a warm
 * instance that had already resolved (and cached) the dynamic import once.
 * pdfjs checks `globalThis.pdfjsWorker` before ever attempting that dynamic
 * import (its documented Node/bundler escape hatch) -- statically importing
 * the worker module ourselves here guarantees the file tracer includes it
 * *and* skips the fragile dynamic-import path entirely.
 */
if (typeof (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker === 'undefined') {
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;
}

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
