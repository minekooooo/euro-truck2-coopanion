import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ETS2_DEFINITION } from '../src/definition.ts';

const out = fileURLToPath(new URL('../describe.json', import.meta.url));
writeFileSync(out, JSON.stringify(ETS2_DEFINITION.describe, null, 2) + '\n', 'utf8');
console.log('wrote', out);
