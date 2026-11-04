#!/usr/bin/env node
/**
 * Comprueba, al hacer el commit, que un `Test-Removal:` del mensaje lo ve `git interpret-trailers --parse`
 * (último párrafo, junto a `Co-Authored-By`). Retro S5: en L1D-306 el trailer quedó en otro párrafo, la CI lo
 * rechazó y arreglarlo exigía reescribir historia (force-push denegado). Lo llama `.claude/hooks/pre-commit-gate.sh`.
 * Uso: <mensaje> | node scripts/ci/mensaje-test-removal.mjs   (sale 1 si está declarado y no es visible)
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { evaluarTestRemoval } from './verificar-commits-tdd.mjs';

export function veredicto(mensaje, evaluar = evaluarTestRemoval) {
  const { declarado, visible } = evaluar(mensaje);
  return declarado && !visible ? 'invisible' : 'ok';
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const mensaje = readFileSync(0, 'utf8');
  if (veredicto(mensaje) === 'invisible') {
    console.error(
      'Test-Removal: no es un trailer válido: ponlo en el último párrafo del mensaje, junto a Co-Authored-By ' +
        '(git interpret-trailers --parse no lo ve). Corrígelo antes de commitear: después exigiría reescribir historia.',
    );
    process.exit(1);
  }
}
