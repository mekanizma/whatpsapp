import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedKnowledgeFile,
  isAllowedKnowledgeMimeType,
  parseKnowledgeDocument,
  titleFromFilename,
} from './document-parser.service';

describe('document-parser.service', () => {
  it('allows markdown extensions', () => {
    assert.equal(isAllowedKnowledgeFile('readme.md'), true);
    assert.equal(isAllowedKnowledgeFile('notes.MARKDOWN'), true);
    assert.equal(isAllowedKnowledgeFile('info.txt'), true);
  });

  it('allows markdown mime types without extension', () => {
    assert.equal(isAllowedKnowledgeMimeType('text/markdown', 'notes'), true);
    assert.equal(isAllowedKnowledgeMimeType('text/plain', 'readme.txt'), true);
  });

  it('parses markdown file content', async () => {
    const buffer = Buffer.from('# Başlık\n\nMerhaba **dünya**.', 'utf8');
    const parsed = await parseKnowledgeDocument(buffer, 'ornek.md', 'text/markdown');

    assert.equal(parsed.file_type, 'MD');
    assert.equal(parsed.title, titleFromFilename('ornek.md'));
    assert.match(parsed.content, /Başlık/);
    assert.match(parsed.content, /\*\*dünya\*\*/);
    assert.ok(parsed.char_count > 0);
    assert.ok(parsed.chunk_estimate >= 1);
  });

  it('strips UTF-8 BOM from text files', async () => {
    const buffer = Buffer.from('\uFEFF# BOM test\nSatır', 'utf8');
    const parsed = await parseKnowledgeDocument(buffer, 'bom.md');

    assert.equal(parsed.content.startsWith('# BOM test'), true);
  });
});
