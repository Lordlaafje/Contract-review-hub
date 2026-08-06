/**
 * extract.mjs — pull plain text from an uploaded contract (PDF / DOCX / TXT).
 */
import fs from 'node:fs/promises';
import mammoth from 'mammoth';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const MIN_CHARS = 200;

export async function extractText(filePath, originalName = '') {
  const name = (originalName || filePath).toLowerCase();
  let text = '';
  try {
    if (name.endsWith('.docx')) {
      const res = await mammoth.extractRawText({ path: filePath });
      text = res.value || '';
    } else if (name.endsWith('.pdf')) {
      const pdfParse = require('pdf-parse');
      const buf = await fs.readFile(filePath);
      const res = await pdfParse(buf);
      text = res.text || '';
    } else if (name.endsWith('.txt') || name.endsWith('.md')) {
      text = await fs.readFile(filePath, 'utf8');
    } else {
      // best effort: try docx then treat as text
      try {
        const res = await mammoth.extractRawText({ path: filePath });
        text = res.value || '';
      } catch {
        text = await fs.readFile(filePath, 'utf8');
      }
    }
  } catch (e) {
    return { ok: false, text: '', note: 'Extraction error: ' + e.message };
  }

  text = (text || '').replace(/ /g, ' ').trim();
  if (text.length < MIN_CHARS) {
    return { ok: false, text, note: `Extracted only ${text.length} chars (< ${MIN_CHARS}) — likely a scan without OCR or an unsupported file.` };
  }
  return { ok: true, text, note: '' };
}
