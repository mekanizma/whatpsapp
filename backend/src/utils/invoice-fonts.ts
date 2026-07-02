/**
 * PDF fatura için Unicode (Türkçe) font kaydı
 */

import path from 'path';
import fs from 'fs';
import type PDFKit from 'pdfkit';

export const INVOICE_FONT = 'DejaVuSans';
export const INVOICE_FONT_BOLD = 'DejaVuSans-Bold';

function resolveFontDir(): string {
  const candidates = [
    path.join(__dirname, '../../node_modules/dejavu-fonts-ttf/ttf'),
    path.join(process.cwd(), 'node_modules/dejavu-fonts-ttf/ttf'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'DejaVuSans.ttf'))) return dir;
  }
  throw new Error('DejaVuSans font dosyası bulunamadı. npm install dejavu-fonts-ttf çalıştırın.');
}

export function registerInvoiceFonts(doc: PDFKit.PDFDocument): void {
  const fontDir = resolveFontDir();
  doc.registerFont(INVOICE_FONT, path.join(fontDir, 'DejaVuSans.ttf'));
  doc.registerFont(INVOICE_FONT_BOLD, path.join(fontDir, 'DejaVuSans-Bold.ttf'));
}
