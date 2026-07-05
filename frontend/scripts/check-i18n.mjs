import fs from 'fs';
import path from 'path';

const tr = JSON.parse(fs.readFileSync('./src/i18n/locales/tr.json', 'utf8'));
const en = JSON.parse(fs.readFileSync('./src/i18n/locales/en.json', 'utf8'));

function flatten(obj, p = '') {
  const o = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(o, flatten(v, key));
    else o[key] = v;
  }
  return o;
}

const ftr = flatten(tr);
const fen = flatten(en);
const turkish = /[ğüşıöçĞÜŞİÖÇ]/;

console.log('=== Turkish text in EN ===');
Object.entries(fen).filter(([, v]) => typeof v === 'string' && turkish.test(v)).forEach(([k, v]) => console.log(k, '=>', v));

const keys = new Set();
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory() && !f.includes('node_modules')) walk(p);
    else if (/\.(tsx?|jsx?)$/.test(f)) {
      const c = fs.readFileSync(p, 'utf8');
      for (const m of c.matchAll(/t\(\s*['"]([^'"]+)['"]/g)) keys.add(m[1]);
    }
  }
}
walk('./src');

const dynamicPrefixes = ['staff.roles.', 'common.plans.', 'common.status.', 'common.categories.', 'common.roles.', 'calendar.status.', 'admin.activity.actions.', 'admin.plans.currencies.', 'calendar.'];

const missingEn = [...keys].filter((k) => !fen[k] && !dynamicPrefixes.some((p) => k.startsWith(p)));
const missingTr = [...keys].filter((k) => !ftr[k] && !dynamicPrefixes.some((p) => k.startsWith(p)));

console.log('\n=== t() keys missing in EN ===');
missingEn.sort().forEach((k) => console.log(k));

console.log('\n=== t() keys missing in TR ===');
missingTr.sort().forEach((k) => console.log(k));
