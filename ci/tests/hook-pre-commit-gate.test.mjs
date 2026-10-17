import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Prueba del hook `.claude/hooks/pre-commit-gate.sh` con repos git temporales y datos sintéticos.
// Los señuelos se arman por partes para que este archivo no dispare el propio escaneo del hook.
const HOOK = path.resolve(import.meta.dirname, '../../.claude/hooks/pre-commit-gate.sh');
const ENTORNO_GIT = {
  ...process.env,
  GIT_AUTHOR_NAME: 'T',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 'T',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

const PY_DOS = 'def test_uno():\n    assert 1\n\n\ndef test_dos():\n    assert 2\n';
const PY_UNO = 'def test_uno():\n    assert 1\n';
const PY_DOS_SOLO = 'def test_dos():\n    assert 2\n';

let repo;
let bin;

const git = (...args) => execFileSync('git', args, { cwd: repo, env: ENTORNO_GIT, encoding: 'utf8' });
const escribir = (rel, contenido) => {
  mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  writeFileSync(path.join(repo, rel), contenido);
};
const confirmar = (mensaje) => git('commit', '-q', '--no-verify', '-m', mensaje);

// Ejecuta el hook como lo hace .claude/settings.json (Bash(git commit *)): JSON por stdin.
const correrHook = (comando = 'git commit -m "x"') => {
  const r = spawnSync('bash', [HOOK], {
    input: JSON.stringify({ cwd: repo, tool_input: { command: comando } }),
    env: { ...ENTORNO_GIT, PATH: `${bin}:${process.env.PATH}` },
    encoding: 'utf8',
  });
  return { codigo: r.status, stderr: r.stderr };
};

// Dos ramas divergentes desde una base con `base`; deja la rama de feature como HEAD.
const prepararDivergencia = ({ base, enFeature, enMain }) => {
  git('init', '-q', '-b', 'main');
  for (const [rel, c] of Object.entries(base)) escribir(rel, c);
  git('add', '-A');
  confirmar('base');
  git('checkout', '-q', '-b', 'feature');
  for (const [rel, c] of Object.entries(enFeature)) escribir(rel, c);
  git('add', '-A');
  confirmar('feature');
  git('checkout', '-q', 'main');
  for (const [rel, c] of Object.entries(enMain)) {
    if (c === null) rmSync(path.join(repo, rel));
    else escribir(rel, c);
  }
  git('add', '-A');
  confirmar('main');
  git('checkout', '-q', 'feature');
  git('merge', '-q', '--no-ff', '--no-commit', 'main');
};

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'hook-gate-repo-'));
  bin = mkdtempSync(path.join(tmpdir(), 'hook-gate-bin-'));
});
afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(bin, { recursive: true, force: true });
});

describe('pre-commit-gate: higiene de tests en commits de merge', () => {
  it('pasa sin Test-Removal cuando el merge trae un test trasladado por la otra rama [hook merge AC-1]', () => {
    prepararDivergencia({
      base: { 'tests/test_a.py': PY_DOS },
      enFeature: { 'otro.txt': 'feature\n' },
      enMain: { 'tests/test_a.py': PY_UNO, 'tests/test_b.py': PY_DOS_SOLO },
    });

    const { codigo, stderr } = correrHook();

    expect(stderr).not.toContain('elimina tests');
    expect(codigo).toBe(0);
  });

  it('pasa cuando HEAD tiene el test y MERGE_HEAD ya no, y el resultado tampoco [hook merge AC-1]', () => {
    prepararDivergencia({
      base: { 'tests/test_a.py': PY_DOS },
      enFeature: { 'otro.txt': 'feature\n' },
      enMain: { 'tests/test_a.py': PY_UNO },
    });

    expect(correrHook().codigo).toBe(0);
  });

  it('bloquea sin Test-Removal cuando la resolución borra un test presente en ambos padres [hook merge AC-2]', () => {
    prepararDivergencia({
      base: { 'tests/test_a.py': PY_DOS },
      enFeature: { 'otro.txt': 'feature\n' },
      enMain: { 'otro2.txt': 'main\n' },
    });
    escribir('tests/test_a.py', PY_UNO);
    git('add', '-A');

    const { codigo, stderr } = correrHook();

    expect(codigo).toBe(2);
    expect(stderr).toContain('test_dos');
  });

  it('pasa con Test-Removal cuando la resolución borra un test presente en ambos padres [hook merge AC-2]', () => {
    prepararDivergencia({
      base: { 'tests/test_a.py': PY_DOS },
      enFeature: { 'otro.txt': 'feature\n' },
      enMain: { 'otro2.txt': 'main\n' },
    });
    escribir('tests/test_a.py', PY_UNO);
    git('add', '-A');

    expect(correrHook('git commit -m "merge\n\nTest-Removal: AC cambiado"').codigo).toBe(0);
  });

  it('bloquea cuando la resolución borra un archivo de test presente en ambos padres [hook merge AC-2]', () => {
    prepararDivergencia({
      base: { 'tests/test_a.py': PY_DOS },
      enFeature: { 'otro.txt': 'feature\n' },
      enMain: { 'otro2.txt': 'main\n' },
    });
    git('rm', '-q', 'tests/test_a.py');

    const { codigo, stderr } = correrHook();

    expect(codigo).toBe(2);
    expect(stderr).toContain('test_a.py');
  });

  it('bloquea un skip añadido en un merge igual que en un commit normal [hook merge AC-4]', () => {
    prepararDivergencia({
      base: { 'tests/test_a.py': PY_UNO },
      enFeature: { 'otro.txt': 'feature\n' },
      enMain: { 'otro2.txt': 'main\n' },
    });
    escribir('tests/test_a.py', `${PY_UNO}\n\n@pytest.mark.${'xfail'}\ndef test_tres():\n    assert 3\n`);
    git('add', '-A');

    expect(correrHook().codigo).toBe(2);
  });
});

describe('pre-commit-gate: MERGE_HEAD forjado u obsoleto no debilita un commit normal', () => {
  // Repo con un commit previo sin el test (ancestro de HEAD) y otro que lo añade.
  const prepararHistorial = () => {
    git('init', '-q', '-b', 'main');
    escribir('README.txt', 'base\n');
    git('add', '-A');
    confirmar('vacío');
    const ancestro = git('rev-parse', 'HEAD').trim();
    escribir('tests/test_a.py', PY_DOS);
    git('add', '-A');
    confirmar('con test');
    return ancestro;
  };
  const forjarMergeHead = (sha) => writeFileSync(path.join(repo, '.git', 'MERGE_HEAD'), `${sha}\n`);

  it('bloquea el borrado de un test cuando MERGE_HEAD es un ancestro de HEAD sin el test [hook merge P4]', () => {
    forjarMergeHead(prepararHistorial());
    escribir('tests/test_a.py', PY_UNO);
    git('add', '-A');

    const { codigo, stderr } = correrHook();

    expect(codigo).toBe(2);
    expect(stderr).toContain('test_dos');
  });

  it('bloquea el borrado del archivo de test cuando MERGE_HEAD es un ancestro de HEAD sin el test [hook merge P4b]', () => {
    forjarMergeHead(prepararHistorial());
    git('rm', '-q', 'tests/test_a.py');

    expect(correrHook().codigo).toBe(2);
  });

  it('bloquea el borrado de un test cuando MERGE_HEAD es un commit huérfano sin base común [hook merge P5]', () => {
    prepararHistorial();
    const arbolVacio = git('hash-object', '-t', 'tree', '-w', '/dev/null').trim();
    forjarMergeHead(git('commit-tree', arbolVacio, '-m', 'huérfano').trim());
    escribir('tests/test_a.py', PY_UNO);
    git('add', '-A');

    expect(correrHook().codigo).toBe(2);
  });
});

describe('pre-commit-gate: merge con tests en otra ruta', () => {
  it('bloquea cuando la otra rama movió el test a otro archivo y la resolución lo quita de ahí [hook merge P7]', () => {
    prepararDivergencia({
      base: { 'tests/test_a.py': PY_DOS },
      enFeature: { 'otro.txt': 'feature\n' },
      enMain: { 'tests/test_a.py': PY_UNO, 'tests/test_b.py': PY_DOS_SOLO },
    });
    escribir('tests/test_b.py', '# vacío\n');
    git('add', '-A');

    const { codigo, stderr } = correrHook();

    expect(codigo).toBe(2);
    expect(stderr).toContain('test_dos');
  });

  it('bloquea cuando la otra rama renombró el archivo de test y la resolución lo borra [hook merge P8]', () => {
    prepararDivergencia({
      base: { 'tests/test_a.py': PY_DOS },
      enFeature: { 'otro.txt': 'feature\n' },
      enMain: { 'tests/test_a.py': null, 'tests/test_z.py': PY_DOS },
    });
    git('rm', '-q', '-f', 'tests/test_z.py');

    expect(correrHook().codigo).toBe(2);
  });

  it('bloquea cuando la resolución borra un test presente en ambos aunque la otra rama aportó uno nuevo [hook merge P9]', () => {
    prepararDivergencia({
      base: { 'tests/test_a.py': PY_DOS },
      enFeature: { 'otro.txt': 'feature\n' },
      enMain: { 'tests/test_a.py': `${PY_DOS}\n\ndef test_tres():\n    assert 3\n` },
    });
    escribir('tests/test_a.py', `${PY_UNO}\n\ndef test_tres():\n    assert 3\n`);
    git('add', '-A');

    const { codigo, stderr } = correrHook();

    expect(codigo).toBe(2);
    expect(stderr).toContain('test_dos');
  });
});

describe('pre-commit-gate: commit normal', () => {
  it('bloquea sin Test-Removal cuando el commit borra un test [hook merge AC-3]', () => {
    git('init', '-q', '-b', 'main');
    escribir('tests/test_a.py', PY_DOS);
    git('add', '-A');
    confirmar('base');
    escribir('tests/test_a.py', PY_UNO);
    git('add', '-A');

    const { codigo, stderr } = correrHook();

    expect(codigo).toBe(2);
    expect(stderr).toContain('test_dos');
  });

  it('pasa con Test-Removal cuando el commit borra un test [hook merge AC-3]', () => {
    git('init', '-q', '-b', 'main');
    escribir('tests/test_a.py', PY_DOS);
    git('add', '-A');
    confirmar('base');
    escribir('tests/test_a.py', PY_UNO);
    git('add', '-A');

    expect(correrHook('git commit -m "x\n\nTest-Removal: AC cambiado"').codigo).toBe(0);
  });
});

describe('pre-commit-gate: señuelos sintéticos siguen bloqueando', () => {
  const SENUELOS = {
    'clave de AWS': ['src/a.txt', `clave = ${'AKIA'}${'ABCDEFGHIJKLMNOP'}\n`],
    'api_key literal': ['src/a.txt', `api_key${'='}"abcdefghijkl"\n`],
    'llave privada': ['src/a.txt', `-----BEGIN RSA ${'PRIVATE KEY'}-----\n`],
    'cédula': ['src/a.txt', `${'cédula'}${': '}${'12345678'}\n`],
    'email fuera de dominios de prueba': ['src/a.txt', `contacto ${['persona', 'clinica-real.org'].join('@')}\n`],
    'it.skip': ['web/a.test.ts', `${'it'}.${'skip'}('x', () => {});\n`],
    'pytest xfail': ['tests/test_x.py', `@pytest.mark.${'xfail'}\ndef test_x():\n    assert 0\n`],
  };

  beforeEach(() => {
    git('init', '-q', '-b', 'main');
    escribir('README.txt', 'base\n');
    git('add', '-A');
    confirmar('base');
  });

  for (const [nombre, [rel, contenido]] of Object.entries(SENUELOS)) {
    it(`bloquea ${nombre} cuando se añade en lo staged [hook merge AC-4]`, () => {
      escribir(rel, contenido);
      git('add', '-A');

      expect(correrHook().codigo).toBe(2);
    });
  }

  it('bloquea cuando openspec validate falla [hook merge AC-4]', () => {
    writeFileSync(path.join(bin, 'openspec'), '#!/bin/sh\nexit 1\n');
    chmodSync(path.join(bin, 'openspec'), 0o755);
    escribir('openspec/changes/x/proposal.md', '# x\n');
    git('add', '-A');

    expect(correrHook().codigo).toBe(2);
  });

  it('pasa con un cambio inocuo [hook merge AC-4]', () => {
    escribir('src/b.txt', 'hola\n');
    git('add', '-A');

    expect(correrHook().codigo).toBe(0);
  });
});

describe('pre-commit-gate: falla cerrado', () => {
  // Bytes no UTF-8 bajo tests/fixtures/: uno sin NUL (git lo trata como texto) y otro con NUL (binario).
  const FIXTURES_BINARIOS = {
    'tests/fixtures/sin-nul.bin': Buffer.from([0xff, 0xfe, 0x80, 0xc3, 0x28, 0x0a]),
    'tests/fixtures/con-nul.bin': Buffer.from([0xff, 0x00, 0xfe, 0x80, 0x00]),
  };

  it('bloquea el borrado de un test presente en ambos padres aunque haya fixtures no UTF-8 bajo tests/ [hook cerrado H3]', () => {
    prepararDivergencia({
      base: { 'tests/test_a.py': PY_DOS },
      enFeature: { 'otro.txt': 'feature\n' },
      enMain: FIXTURES_BINARIOS,
    });
    escribir('tests/test_a.py', PY_UNO);
    git('add', '-A');

    const { codigo, stderr } = correrHook();

    expect(codigo).toBe(2);
    expect(stderr).toContain('test_dos');
  });

  it('pasa un merge con fixtures no UTF-8 bajo tests/ cuando no se elimina ningún test [hook cerrado H3]', () => {
    prepararDivergencia({
      base: { 'tests/test_a.py': PY_DOS },
      enFeature: { 'otro.txt': 'feature\n' },
      enMain: FIXTURES_BINARIOS,
    });

    const { codigo, stderr } = correrHook();

    expect(stderr).not.toContain('Traceback');
    expect(codigo).toBe(0);
  });

  it('bloquea cuando el análisis de tests en Python falla por cualquier causa [hook cerrado M2]', () => {
    const pythonReal = execFileSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).trim();
    const sustituto = path.join(bin, 'python3');
    writeFileSync(sustituto, `#!/bin/sh\ncase "$*" in *defaultdict*) exit 1;; esac\nexec "${pythonReal}" "$@"\n`);
    chmodSync(sustituto, 0o755);
    git('init', '-q', '-b', 'main');
    escribir('README.txt', 'base\n');
    git('add', '-A');
    confirmar('base');
    escribir('src/b.txt', 'hola\n');
    git('add', '-A');

    expect(correrHook().codigo).toBe(2);
  });
});
