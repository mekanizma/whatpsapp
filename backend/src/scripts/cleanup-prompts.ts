/**
 * Ek promptları sil, varsayılan 5 promptu sıfırla, rolleri uygula
 * Kullanım: npx tsx src/scripts/cleanup-prompts.ts
 */

import 'dotenv/config';
import { cleanupAndReseedPrompts } from '../services/prompt.service';

async function main() {
  console.log('Promptlar temizleniyor ve varsayılanlara sıfırlanıyor...');
  const result = await cleanupAndReseedPrompts();
  console.log(`Tamamlandı: ${result.removed} silindi, ${result.reset} sıfırlandı, ${result.seeded} eklendi.`);
}

main().catch((err) => {
  console.error('Hata:', err);
  process.exit(1);
});
