// Simula la regresión que el guardia debe detectar: format:js alcanza contracts/**/*.json y .prettierignore deja de excluir contracts/.
import { readFileSync, writeFileSync } from 'node:fs';

const paquete = JSON.parse(readFileSync('package.json', 'utf8'));
paquete.scripts['format:js'] += ' "contracts/**/*.json"';
writeFileSync('package.json', `${JSON.stringify(paquete, null, 2)}\n`);

const ignorados = readFileSync('.prettierignore', 'utf8').split('\n');
writeFileSync('.prettierignore', ignorados.filter((linea) => linea !== 'contracts/').join('\n'));
