/** Lectura de PDFs con pdf.js, que solo se descarga cuando se abre o se importa un PDF. */
import type { PDFDocumentProxy } from 'pdfjs-dist'

export type { PDFDocumentProxy }

export async function loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs.getDocument({ data }).promise
}
