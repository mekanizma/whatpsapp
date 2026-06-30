import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkByMarkdownH2,
  chunkRecursive,
  chunkText,
  hasMarkdownH2,
} from '../services/chunking.service';

describe('chunking.service', () => {
  it('detects markdown H2 headings', () => {
    assert.equal(hasMarkdownH2('## Burslar\n\nMetin'), true);
    assert.equal(hasMarkdownH2('Sadece düz metin'), false);
  });

  it('splits on ## headings and prefixes Konu', () => {
    const text = `Giriş metni

## Burslar
Burs başvurusu şartları burada.

## Yurtlar
Yurt ücretleri burada.`;

    const chunks = chunkByMarkdownH2(text, 'Üniversite Rehberi');
    assert.ok(chunks.length >= 3);
    assert.match(chunks.find((c) => c.heading === 'Burslar')?.content || '', /^Konu: Burslar/);
    assert.match(chunks.find((c) => c.heading === 'Yurtlar')?.content || '', /^Konu: Yurtlar/);
  });

  it('uses recursive split when no markdown headings', () => {
    const text = 'Paragraf bir.\n\nParagraf iki.\n\nParagraf üç.';
    const chunks = chunkRecursive(text, 'Genel');
    assert.ok(chunks.length >= 1);
    assert.match(chunks[0].content, /^Konu: Genel/);
  });

  it('chunkText prefers markdown strategy', () => {
    const chunks = chunkText('## Fiyatlar\n\nDolgu 2500 TL', 'Klinik');
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].heading, 'Fiyatlar');
    assert.match(chunks[0].content, /Konu: Fiyatlar/);
  });
});
