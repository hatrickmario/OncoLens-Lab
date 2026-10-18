import { execFile } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

const rulesetDeMain = (cambios = {}) => ({
  target: 'branch',
  enforcement: 'active',
  bypass_actors: [],
  conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
  rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'ci-ok' }] } }],
  ...cambios,
});

const faltantes = (respuesta) => evaluarProteccion(respuesta).filter((r) => !r.cumple).map((r) => r.condicion);

describe('evaluarProteccion', () => {
  it('cumple todas las condiciones cuando main exige PR, ci-ok, rama al día y administradores sin bypass [US-036 AC-6]', () => {
    expect(faltantes(protegida())).toEqual([]);
  });

  it('falta el check requerido cuando ci-ok no está entre los contextos [US-036 AC-6]', () => {
    const respuesta = protegida();
    respuesta.protection.required_status_checks = { strict: true, contexts: ['build-test'], checks: [] };

    expect(faltantes(respuesta)).toEqual(['check requerido ci-ok', 'sin bypass para administradores']);
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
      rulesets: [rulesetDeMain()],
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
      rulesets: [rulesetDeMain({ bypass_actors: [{ actor_type: 'RepositoryRole' }] })],
    };

    expect(faltantes(respuesta)).toEqual(['sin bypass para administradores']);
  });
});

describe('evaluarProteccion · fuente del bypass', () => {
  const reglas = [
    { type: 'pull_request', parameters: {} },
    { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: 'ci-ok' }] } },
  ];

  it('ignora un ruleset ajeno con actores con bypass que no exige ci-ok [US-036 AC-6]', () => {
    const ajeno = rulesetDeMain({ rules: [], bypass_actors: [{ actor_type: 'OrganizationAdmin' }] });

    expect(faltantes({ protection: null, rules: reglas, rulesets: [rulesetDeMain(), ajeno] })).toEqual([]);
  });

  it('no cuenta un ruleset que exige ci-ok pero apunta a otra rama [US-036 AC-6]', () => {
    const deOtraRama = rulesetDeMain({ conditions: { ref_name: { include: ['refs/heads/release'], exclude: [] } } });

    expect(faltantes({ protection: null, rules: reglas, rulesets: [deOtraRama] })).toEqual(['sin bypass para administradores']);
  });

  it('falta el bypass cuando el ruleset que exige ci-ok no está activo [US-036 AC-6]', () => {
    expect(faltantes({ protection: null, rules: reglas, rulesets: [rulesetDeMain({ enforcement: 'evaluate' })] })).toEqual(['sin bypass para administradores']);
  });

  it('no da por bueno enforce_admins de una protección clásica que no exige ci-ok [US-036 AC-6]', () => {
    const clasica = protegida().protection;
    clasica.required_status_checks = { strict: true, contexts: ['build-test'], checks: [] };

    expect(faltantes({ protection: clasica, rules: [], rulesets: [] })).toContain('sin bypass para administradores');
  });

  it('exige que cumplan todas las fuentes que exigen ci-ok [US-036 AC-6]', () => {
    const conBypass = rulesetDeMain({ bypass_actors: [{ actor_type: 'RepositoryRole' }] });

    expect(faltantes({ ...protegida(), rulesets: [conBypass] })).toEqual(['sin bypass para administradores']);
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

  // `gh` falso: sin protección clásica (404 con el JSON de error en stdout y código 1) y con un ruleset de main completo.
  async function conGhSoloRulesets() {
    const directorio = await mkdtemp(path.join(os.tmpdir(), 'oncolens-gh-'));
    temporales.push(directorio);
    const ruleset = {
      id: 7,
      target: 'branch',
      enforcement: 'active',
      bypass_actors: [],
      conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
      rules: [
        { type: 'pull_request', parameters: {} },
        { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: 'ci-ok' }] } },
      ],
    };
    const reglas = ruleset.rules;
    const gh = `#!/usr/bin/env bash
case "$*" in
  "repo view"*) echo "dueno/repo" ;;
  *"/branches/main/protection") echo '{"message":"Branch not protected","status":"404"}'; exit 1 ;;
  *"/rules/branches/main") echo '${JSON.stringify(reglas)}' ;;
  *"/rulesets/7") echo '${JSON.stringify(ruleset)}' ;;
  *"/rulesets"*) echo 7 ;;  # el script pide solo los ids con --jq '.[].id'
  *) echo "gh falso: $*" >&2; exit 2 ;;
esac
`;
    await writeFile(path.join(directorio, 'gh'), gh);
    await chmod(path.join(directorio, 'gh'), 0o755);
    return ejecutar('bash', [SCRIPT], { env: { ...process.env, PATH: `${directorio}:${process.env.PATH}` } }).then(
      ({ stdout }) => ({ codigo: 0, stdout }),
      (error) => ({ codigo: error.code, stdout: error.stdout, stderr: error.stderr }),
    );
  }

  it('sale con código 0 cuando main está protegido solo por un ruleset y la API responde 404 a la protección clásica [US-036 AC-6]', async () => {
    const { codigo, stdout, stderr } = await conGhSoloRulesets();

    expect(stderr ?? '').not.toContain('invalid JSON');
    expect(codigo).toBe(0);
    expect(stdout).not.toContain('FALTA');
  });
});
