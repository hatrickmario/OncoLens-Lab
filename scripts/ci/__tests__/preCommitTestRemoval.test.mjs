import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { veredicto } from '../mensaje-test-removal.mjs';

const RAIZ = resolve(import.meta.dirname, '../../..');
const COAUTOR = 'Co-Authored-By: A <a@example.com>';

describe('veredicto del trailer Test-Removal', () => {
  it('da ok cuando el mensaje no declara Test-Removal', () => {
    expect(veredicto(`feat(L1D-1): algo\n\n${COAUTOR}\n`)).toBe('ok');
  });

  it('da ok cuando el trailer está en el último párrafo junto a Co-Authored-By', () => {
    expect(veredicto(`test(L1D-1): cambia\n\nTest-Removal: AC cambiado\n${COAUTOR}\n`)).toBe('ok');
  });

  it('da invisible cuando el trailer queda en un párrafo anterior al último, como en L1D-306', () => {
    expect(
      veredicto(`test(L1D-1): cambia\n\nTest-Removal: AC cambiado en la spec.\n\n${COAUTOR}\n`),
    ).toBe('invisible');
  });
});

describe('pre-commit-gate.sh · Test-Removal [retro S5]', () => {
  let repo;
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'oncolens-hook-'));
    spawnSync('git', ['init', '-q'], { cwd: repo });
    mkdirSync(join(repo, 'scripts/ci'), { recursive: true });
    copyFileSync(
      join(RAIZ, 'scripts/ci/mensaje-test-removal.mjs'),
      join(repo, 'scripts/ci/mensaje-test-removal.mjs'),
    );
    copyFileSync(
      join(RAIZ, 'scripts/ci/verificar-commits-tdd.mjs'),
      join(repo, 'scripts/ci/verificar-commits-tdd.mjs'),
    );
    writeFileSync(join(repo, 'a.txt'), 'x\n');
    spawnSync('git', ['add', 'a.txt'], { cwd: repo });
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  function ejecutarHook(comando) {
    const entrada = JSON.stringify({ cwd: repo, tool_input: { command: comando } });
    return spawnSync('bash', [join(RAIZ, '.claude/hooks/pre-commit-gate.sh')], {
      input: entrada,
      encoding: 'utf8',
    });
  }

  it('bloquea el commit cuando el Test-Removal de un heredoc queda fuera del último párrafo', () => {
    const cmd = `git commit -F - <<'EOF'\ntest(L1D-1): cambia\n\nTest-Removal: AC cambiado\n\n${COAUTOR}\nEOF`;

    const r = ejecutarHook(cmd);

    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Test-Removal');
  });

  it('deja pasar el commit cuando el Test-Removal está junto a Co-Authored-By', () => {
    const cmd = `git commit -F - <<'EOF'\ntest(L1D-1): cambia\n\nTest-Removal: AC cambiado\n${COAUTOR}\nEOF`;

    const r = ejecutarHook(cmd);

    expect(r.status).toBe(0);
  });

  it('bloquea el commit con -m cuando el Test-Removal queda en otro párrafo', () => {
    const cmd = `git commit -m "test(L1D-1): cambia" -m "Test-Removal: AC cambiado" -m "${COAUTOR}"`;

    const r = ejecutarHook(cmd);

    expect(r.status).toBe(2);
  });
});
