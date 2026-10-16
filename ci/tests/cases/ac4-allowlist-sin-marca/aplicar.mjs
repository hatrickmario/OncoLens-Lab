// Quita la marca clase: sintetico de la entrada FX-T4a-a.
import { readFileSync, writeFileSync } from 'node:fs';

const archivo = 'config/pii-allowlist.json';
const allowlist = JSON.parse(readFileSync(archivo, 'utf8'));
delete allowlist.find((candidata) => candidata.fixture === 'FX-T4a-a').clase;
writeFileSync(archivo, `${JSON.stringify(allowlist, null, 2)}\n`);
