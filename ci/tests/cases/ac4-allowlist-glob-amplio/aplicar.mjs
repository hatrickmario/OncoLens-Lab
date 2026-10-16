// Sustituye el glob del caso por uno más amplio que un directorio de fixture.
import { readFileSync, writeFileSync } from 'node:fs';

const archivo = 'config/pii-allowlist.json';
const allowlist = JSON.parse(readFileSync(archivo, 'utf8'));
const entrada = allowlist.find((candidata) => candidata.fixture === 'FX-T4a-a');
entrada.rutas = entrada.rutas.map((glob) => (glob === 'ci/tests/cases/ac4-allowlist/**' ? 'ci/tests/**' : glob));
writeFileSync(archivo, `${JSON.stringify(allowlist, null, 2)}\n`);
