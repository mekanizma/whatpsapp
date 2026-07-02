import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTags,
  buildIndexableText,
  primaryEntryToPreview,
  mergeMetadataWithSource,
  cleanSourceContent,
  type KnowledgeAnalysisResult,
} from './knowledge-analysis.service';

describe('knowledge-analysis', () => {
  it('normalizeTags tekrarları kaldırır ve küçük harfe çevirir', () => {
    const tags = normalizeTags(['Yurt', 'yurt', 'Dormitory', '  konaklama  ', '', 123]);
    assert.deepEqual(tags, ['yurt', 'dormitory', 'konaklama']);
  });

  it('buildIndexableText başlık ve etiketleri içeriğe ekler', () => {
    const text = buildIndexableText('Öğrenci yurdu bilgileri.', ['yurt', 'dormitory'], 'Konaklama');
    assert.match(text, /Başlık: Konaklama/);
    assert.match(text, /Etiketler: yurt, dormitory/);
    assert.match(text, /Öğrenci yurdu bilgileri/);
  });

  it('tek konu için orijinal içeriğin tamamını korur', () => {
    const source = 'Ücret bilgisi: Yıllık 50.000 TL.\n\nBurs: %25 indirim mevcuttur.\n\nDetaylı açıklama burada.';
    const metadata = [
      {
        title: 'Ücret ve Burs Bilgileri',
        category: 'Ücretler',
        tags: ['ücret', 'burs'],
      },
    ];

    const entries = mergeMetadataWithSource(source, metadata);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].content, cleanSourceContent(source));
    assert.equal(entries[0].title, 'Ücret ve Burs Bilgileri');
  });

  it('çoklu konu için start_marker ile orijinal metinden böler', () => {
    const source = [
      'ÜCRETLER',
      'Yıllık ücret 50.000 TL.',
      '',
      'KONAKLAMA',
      'Yurt ücreti 8.000 TL.',
    ].join('\n');

    const metadata = [
      {
        title: 'Ücretler',
        category: 'Ücretler',
        tags: ['ücret'],
        start_marker: 'ÜCRETLER',
      },
      {
        title: 'Konaklama',
        category: 'Konaklama',
        tags: ['yurt'],
        start_marker: 'KONAKLAMA',
      },
    ];

    const entries = mergeMetadataWithSource(source, metadata);
    assert.equal(entries.length, 2);
    assert.match(entries[0].content, /Yıllık ücret 50.000 TL/);
    assert.match(entries[1].content, /Yurt ücreti 8.000 TL/);
  });

  it('primaryEntryToPreview tek kayıtta kaynak içeriğini kullanır', () => {
    const source = 'Tam orijinal metin burada yer alır. Hiçbir şey eksilmez.';
    const analysis: KnowledgeAnalysisResult = {
      analyzed: true,
      split: false,
      entries: [
        {
          title: 'Başlık',
          category: 'Genel Bilgiler',
          tags: ['etiket'],
          content: 'Kısa LLM özeti',
        },
      ],
    };

    const preview = primaryEntryToPreview(analysis, undefined, source);
    assert.equal(preview.content, cleanSourceContent(source));
    assert.equal(preview.title, 'Başlık');
  });
});
