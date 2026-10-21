import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { excepcionVencida, hallazgosBloqueantes } from '../auditar-dependencias.mjs';

const ejecutar = promisify(execFile);
const RAIZ = path.resolve(import.meta.dirname, '../../..');
const SCRIPT = path.join(RAIZ, 'scripts/ci/auditar-dependencias.mjs');
const HOY = '2026-10-21';

const NPM_LIMPIO = { auditReportVersion: 2, vulnerabilities: {} };
const PIP_LIMPIO = { dependencies: [{ name: 'fastapi', version: '0.143.2', vulns: [] }] };

const avisoNpm = (severidad = 'high') => ({
  auditReportVersion: 2,
  vulnerabilities: {
    braces: {
      name: 'braces',
      severity: severidad,
      nodes: ['node_modules/braces'],
      via: [{ source: 1240992, name: 'braces', url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm', severity: severidad }],
    },
    micromatch: { name: 'micromatch', severity: severidad, nodes: ['node_modules/micromatch'], via: ['braces'] },
  },
});
const VERSIONES = { 'node_modules/braces': '3.0.3' };

const AVISO_PIP = {
  dependencies: [{ name: 'certifi', version: '2024.1.1', vulns: [{ id: 'PYSEC-2024-1', aliases: ['CVE-2024-0001'], fix_versions: ['2024.2.2'] }] }],
};

const excepcion = (cambios = {}) => ({
  id: 'GHSA-vfj7-8cjw-p6xm',
  paquete: 'braces',
  motivo: 'sin parche',
  mitigacion: 'solo desarrollo',
  revisarAntesDe: '2026-11-20',
  ...cambios,
});

describe('hallazgosBloqueantes', () => {
  it('no devuelve nada cuando ni npm ni pip-audit traen avisos [US-217 AC-1]', () => {
    const { bloqueantes } = hallazgosBloqueantes(NPM_LIMPIO, PIP_LIMPIO, [], HOY);

    expect(bloqueantes).toEqual([]);
  });

  it('nombra paquete, versión instalada e identificador cuando npm trae un aviso alto [US-217 AC-2]', () => {
    const { bloqueantes } = hallazgosBloqueantes(avisoNpm(), PIP_LIMPIO, [], HOY, VERSIONES);

    expect(bloqueantes).toEqual(['npm: braces 3.0.3 — aviso GHSA-vfj7-8cjw-p6xm']);
  });

  it('ignora los avisos de severidad moderada de npm [US-217 AC-1]', () => {
    expect(hallazgosBloqueantes(avisoNpm('moderate'), PIP_LIMPIO, [], HOY, VERSIONES).bloqueantes).toEqual([]);
  });

  it('nombra paquete, versión e identificador PYSEC cuando pip-audit trae un aviso [US-217 AC-2]', () => {
    const { bloqueantes } = hallazgosBloqueantes(NPM_LIMPIO, AVISO_PIP, [], HOY);

    expect(bloqueantes).toEqual(['pip: certifi 2024.1.1 — aviso PYSEC-2024-1']);
  });

  it('deja pasar el aviso y lo informa cuando una excepción vigente lo cubre [US-217 AC-3]', () => {
    const { bloqueantes, aplicadas } = hallazgosBloqueantes(avisoNpm(), PIP_LIMPIO, [excepcion()], HOY, VERSIONES);

    expect(bloqueantes).toEqual([]);
    expect(aplicadas).toEqual(['excepción GHSA-vfj7-8cjw-p6xm aplicada a braces 3.0.3 (revisar antes de 2026-11-20)']);
  });

  it('acepta un alias CVE de pip-audit como identificador de la excepción [US-217 AC-3]', () => {
    const cubierta = excepcion({ id: 'CVE-2024-0001', paquete: 'certifi' });

    expect(hallazgosBloqueantes(NPM_LIMPIO, AVISO_PIP, [cubierta], HOY).bloqueantes).toEqual([]);
  });

  it('no cubre un aviso de otro paquete aunque el identificador coincida [US-217 AC-3]', () => {
    const ajena = excepcion({ paquete: 'otro' });

    expect(hallazgosBloqueantes(avisoNpm(), PIP_LIMPIO, [ajena], HOY, VERSIONES).bloqueantes).toEqual(['npm: braces 3.0.3 — aviso GHSA-vfj7-8cjw-p6xm']);
  });

  it('nombra la excepción y deja el aviso sin cubrir cuando está vencida [US-217 AC-3]', () => {
    const { bloqueantes } = hallazgosBloqueantes(avisoNpm(), PIP_LIMPIO, [excepcion({ revisarAntesDe: '2026-10-20' })], HOY, VERSIONES);

    expect(bloqueantes).toEqual([
      'excepción GHSA-vfj7-8cjw-p6xm vencida el 2026-10-20 (paquete braces)',
      'npm: braces 3.0.3 — aviso GHSA-vfj7-8cjw-p6xm',
    ]);
  });

  it('acepta la excepción el mismo día de la fecha de revisión [US-217 AC-3]', () => {
    expect(hallazgosBloqueantes(NPM_LIMPIO, PIP_LIMPIO, [excepcion({ revisarAntesDe: HOY })], HOY).bloqueantes).toEqual([]);
  });

  it('rechaza una excepción sin mitigacion nombrando el campo [US-217 AC-3]', () => {
    const { mitigacion, ...sinMitigacion } = excepcion();

    const { bloqueantes } = hallazgosBloqueantes(NPM_LIMPIO, PIP_LIMPIO, [sinMitigacion], HOY);

    expect(mitigacion).toBeDefined();
    expect(bloqueantes).toEqual(['excepción GHSA-vfj7-8cjw-p6xm inválida: falta el campo mitigacion']);
  });

  it('rechaza una excepción con una fecha que no es AAAA-MM-DD [US-217 AC-3]', () => {
    const { bloqueantes } = hallazgosBloqueantes(NPM_LIMPIO, PIP_LIMPIO, [excepcion({ revisarAntesDe: '20/11/2026' })], HOY);

    expect(bloqueantes).toEqual(['excepción GHSA-vfj7-8cjw-p6xm inválida: revisarAntesDe no es una fecha AAAA-MM-DD']);
  });

  it('falla en vez de dar verde cuando la salida de npm audit no es un informe [US-217 AC-1]', () => {
    expect(() => hallazgosBloqueantes({ error: { code: 'ENOAUDIT' } }, PIP_LIMPIO, [], HOY)).toThrow(/npm audit/);
  });
});

describe('excepcionVencida', () => {
  it('es falsa el día de la revisión y verdadera al día siguiente [US-217 AC-3]', () => {
    expect([excepcionVencida(excepcion(), '2026-11-20'), excepcionVencida(excepcion(), '2026-11-21')]).toEqual([false, true]);
  });
});

describe('auditar-dependencias.mjs', () => {
  const correr = async (npm, pip, excepciones, hoy) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'auditoria-'));
    const rutas = { npm: path.join(dir, 'npm.json'), pip: path.join(dir, 'pip.json'), exc: path.join(dir, 'exc.json') };
    writeFileSync(rutas.npm, JSON.stringify(npm));
    writeFileSync(rutas.pip, JSON.stringify(pip));
    writeFileSync(rutas.exc, JSON.stringify({ excepciones }));
    const args = [SCRIPT, '--npm', rutas.npm, '--pip', rutas.pip, '--excepciones', rutas.exc, '--lockfile', path.join(RAIZ, 'package-lock.json'), '--hoy', hoy];
    return ejecutar('node', args).then(
      ({ stdout, stderr }) => ({ codigo: 0, stdout, stderr }),
      (error) => ({ codigo: error.code, stdout: error.stdout, stderr: error.stderr }),
    );
  };

  it('sale con 1 y nombra paquete, versión del lockfile e identificador cuando hay un aviso alto [US-217 AC-2]', async () => {
    const { codigo, stderr } = await correr(avisoNpm(), PIP_LIMPIO, [], HOY);

    expect(codigo).toBe(1);
    expect(stderr).toMatch(/npm: braces \d+\.\d+\.\d+ — aviso GHSA-vfj7-8cjw-p6xm/);
  });

  it('sale con 0 e imprime la excepción aplicada cuando está vigente [US-217 AC-3]', async () => {
    const { codigo, stdout } = await correr(avisoNpm(), PIP_LIMPIO, [excepcion()], HOY);

    expect(codigo).toBe(0);
    expect(stdout).toMatch(/excepción GHSA-vfj7-8cjw-p6xm aplicada/);
  });

  it('sale con 1 y nombra la excepción cuando venció a la fecha inyectada [US-217 AC-3]', async () => {
    const { codigo, stderr } = await correr(avisoNpm(), PIP_LIMPIO, [excepcion()], '2026-12-01');

    expect(codigo).toBe(1);
    expect(stderr).toMatch(/excepción GHSA-vfj7-8cjw-p6xm vencida/);
  });

  it('la excepción registrada en el repositorio es válida y cubre el aviso actual de braces [US-217 AC-1]', async () => {
    const registradas = JSON.parse(readFileSync(path.join(RAIZ, 'security/audit-exceptions.json'), 'utf8')).excepciones;

    expect(hallazgosBloqueantes(avisoNpm(), PIP_LIMPIO, registradas, HOY, VERSIONES).bloqueantes).toEqual([]);
  });
});

describe('.github/dependabot.yml', () => {
  const config = parse(readFileSync(path.join(RAIZ, '.github/dependabot.yml'), 'utf8'));
  const por = (ecosistema) => config.updates.find((u) => u.ecosystem === ecosistema || u['package-ecosystem'] === ecosistema);
  const directorios = (u) => u.directories ?? [u.directory];

  it('declara npm, pip, github-actions y docker en los directorios del stack [US-217 AC-4]', () => {
    expect(directorios(por('npm'))).toEqual(['/']);
    expect(directorios(por('pip'))).toEqual(['/apps/rag-orchestrator']);
    expect(directorios(por('github-actions'))).toEqual(['/']);
    expect(directorios(por('docker')).sort()).toEqual(['/apps/clinical-api', '/apps/rag-orchestrator', '/apps/web']);
    expect(directorios(por('docker-compose'))).toEqual(['/infra/docker']);
  });

  it('es semanal, con un grupo por ecosistema y sin automerge [US-217 AC-4]', () => {
    for (const u of config.updates) {
      expect(u.schedule.interval).toBe('weekly');
      expect(Object.keys(u.groups)).toHaveLength(1);
    }
    expect(JSON.stringify(config)).not.toMatch(/auto-?merge/i);
  });
});
