/**
 * Tüm AI prompt şablonlarını bilgi-bankası odaklı varsayılanlara sıfırlar
 * Kullanım: npx tsx src/scripts/reset-prompts.ts
 */

import 'dotenv/config';
import { resetAllPromptsToDefault } from '../services/prompt.service';

async function main() {
  console.log('Promptlar varsayılanlara sıfırlanıyor...');
  const result = await resetAllPromptsToDefault();
  console.log(`Tamamlandı: ${result.reset} sıfırlandı, ${result.seeded} yeni eklendi.`);
}

main().catch((err) => {
  console.error('Hata:', err);
  process.exit(1);
});
