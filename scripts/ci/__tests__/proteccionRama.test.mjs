import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { evaluarProteccion } from '../proteccion-rama.mjs';

const ejecutar = promisify(execFile);
const SCRIPT = path.resolve(import.meta.dirname, '../check-branch-protection.sh');

const protegida = () => ({
  protection: {
    required_pull_request_reviews: { required_approving_review_count: 0 },
    required_status_checks: { strict: true, contexts: ['ci-ok'], checks: [{ context: 'ci-ok' }] },
    enforce_admins: { enabled: true },
  },
  rules: [],
  rulesets: [],
});

const faltantes = (respuesta) => evaluarProteccion(respuesta).filter((r) => !r.cumple).map((r) => r.condicion);

describe('evaluarProteccion', () => {
  it('cumple todas las condiciones cuando main exige PR, ci-ok, rama al día y administradores sin bypass [US-036 AC-6]', () => {
    expect(faltantes(protegida())).toEqual([]);
  });

  it('falta el check requerido cuando ci-ok no está entre los contextos [US-036 AC-6]', () => {
    const respuesta = protegida();
    respuesta.protection.required_status_checks = { strict: true, contexts: ['build-test'], checks: [] };

    expect(faltantes(respuesta)).toEqual(['check requerido ci-ok']);
  });

  it('falta todo cuando main no tiene protección ni rulesets [US-036 AC-6]', () => {
    expect(faltantes({ protection: null, rules: [], rulesets: [] })).toHaveLength(4);
  });

  it('cumple con un ruleset activo que exige PR, ci-ok y rama al día sin actores con bypass [US-036 AC-6]', () => {
    const respuesta = {
      protection: null,
      rules: [
        { type: 'pull_request', parameters: {} },
        { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: 'ci-ok' }] } },
      ],
      rulesets: [{ enforcement: 'active', bypass_actors: [] }],
    };

    expect(faltantes(respuesta)).toEqual([]);
  });

  it('falta el bypass cuando el ruleset admite actores con bypass [US-036 AC-6]', () => {
    const respuesta = {
      protection: null,
      rules: [
        { type: 'pull_request', parameters: {} },
        { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: 'ci-ok' }] } },
      ],
      rulesets: [{ enforcement: 'active', bypass_actors: [{ actor_type: 'RepositoryRole' }] }],
    };

    expect(faltantes(respuesta)).toEqual(['sin bypass para administradores']);
  });
});

describe('check-branch-protection.sh', () => {
  const temporales = [];
  afterEach(async () => {
    await Promise.all(temporales.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  async function conRespuesta(respuesta) {
    const directorio = await mkdtemp(path.join(os.tmpdir(), 'oncolens-rama-'));
    temporales.push(directorio);
    const archivo = path.join(directorio, 'respuesta.json');
    await writeFile(archivo, JSON.stringify(respuesta));
    return ejecutar('bash', [SCRIPT, '--from-file', archivo]).then(
      ({ stdout }) => ({ codigo: 0, stdout }),
      (error) => ({ codigo: error.code, stdout: error.stdout }),
    );
  }

  it('sale con código 1 y nombra el check ci-ok cuando la respuesta de fixture no lo exige [US-036 AC-6]', async () => {
    const respuesta = protegida();
    respuesta.protection.required_status_checks = { strict: true, contexts: [], checks: [] };

    const { codigo, stdout } = await conRespuesta(respuesta);

    expect(codigo).toBe(1);
    expect(stdout).toContain('FALTA check requerido ci-ok');
  });

  it('sale con código 0 cuando la respuesta de fixture cumple las cuatro condiciones [US-036 AC-6]', async () => {
    const { codigo, stdout } = await conRespuesta(protegida());

    expect(codigo).toBe(0);
    expect(stdout).not.toContain('FALTA');
  });
});
