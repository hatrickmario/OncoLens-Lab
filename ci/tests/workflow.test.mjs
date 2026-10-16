import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const leerWorkflow = (nombre) => YAML.parse(readFileSync(path.join(RAIZ, '.github/workflows', nombre), 'utf8'));
const textoDe = (nombre) => readFileSync(path.join(RAIZ, '.github/workflows', nombre), 'utf8');

const NOMBRES = readdirSync(path.join(RAIZ, '.github/workflows')).filter((nombre) => /\.ya?ml$/.test(nombre));
const ci = leerWorkflow('ci.yml');
const pasosDe = (job) => job.steps ?? [];
const todosLosPasos = (workflow) => Object.values(workflow.jobs).flatMap(pasosDe);
const SHA_COMPLETO = /^[^@\s]+@[0-9a-f]{40}$/;

describe('ci.yml', () => {
  it('todos los jobs están en el needs de ci-ok [US-036 AC-1]', () => {
    const otros = Object.keys(ci.jobs).filter((nombre) => nombre !== 'ci-ok');

    expect([...ci.jobs['ci-ok'].needs].sort()).toEqual(otros.sort());
  });

  it('ci-ok se evalúa siempre para que un job fallido, omitido o cancelado lo deje en rojo [US-036 AC-1]', () => {
    expect(ci.jobs['ci-ok'].if).toBe('always()');
  });

  it('solo se ejecuta en pull_request y en push a main [US-036 AC-1]', () => {
    expect(Object.keys(ci.on).sort()).toEqual(['pull_request', 'push']);
    expect(ci.on.push.branches).toEqual(['main']);
  });

  it('el job que corre pytest tiene setup-node y npm ci antes [US-036 AC-1]', () => {
    const conPytest = Object.entries(ci.jobs).filter(([, job]) => pasosDe(job).some((paso) => /\bpytest\b/.test(paso.run ?? '')));

    expect(conPytest.length).toBeGreaterThan(0);
    for (const [nombre, job] of conPytest) {
      const pasos = pasosDe(job);
      const indiceDePytest = pasos.findIndex((paso) => /\bpytest\b/.test(paso.run ?? ''));
      const previos = pasos.slice(0, indiceDePytest);
      expect(previos.some((paso) => paso.uses?.startsWith('actions/setup-node@')), `${nombre}: falta actions/setup-node antes de pytest`).toBe(true);
      expect(previos.some((paso) => /\bnpm ci\b/.test(paso.run ?? '')), `${nombre}: falta npm ci antes de pytest`).toBe(true);
    }
  });

  it('no contiene pasos omitidos cuando test:secrets ya existe en el package.json [US-036 AC-1]', () => {
    const scripts = JSON.parse(readFileSync(path.join(RAIZ, 'package.json'), 'utf8')).scripts;

    if (scripts['test:secrets']) expect(textoDe('ci.yml')).not.toContain('omitido:');
  });

  it('cada comando de los fixtures de PR figura tal cual en un paso de ci.yml [US-036 AC-1]', () => {
    const corridas = todosLosPasos(ci).map((paso) => paso.run ?? '').join('\n');
    const casos = readdirSync(path.join(RAIZ, 'ci/tests/cases'));
    const comandos = casos.flatMap((caso) => {
      const definicion = JSON.parse(readFileSync(path.join(RAIZ, 'ci/tests/cases', caso, 'case.json'), 'utf8'));
      return definicion.pendiente ? [] : [].concat(definicion.comando);
    });

    expect(comandos.filter((comando) => !corridas.includes(comando))).toEqual([]);
  });
});

describe.each(NOMBRES)('workflow %s', (nombre) => {
  const workflow = leerWorkflow(nombre);

  it('ningún paso usa continue-on-error ni secrets [US-036 AC-1]', () => {
    const texto = textoDe(nombre);

    expect(texto).not.toMatch(/continue-on-error/);
    expect(texto).not.toMatch(/\bsecrets\./);
    expect(texto).not.toMatch(/secrets:\s*inherit/);
  });

  it('toda acción está fijada por SHA de commit [US-036 AC-6]', () => {
    const acciones = todosLosPasos(workflow).map((paso) => paso.uses).filter(Boolean);

    expect(acciones.filter((accion) => !SHA_COMPLETO.test(accion))).toEqual([]);
  });

  it('todo actions/checkout declara persist-credentials: false para no dejar el token en .git/config [US-036 AC-1]', () => {
    const checkouts = todosLosPasos(workflow).filter((paso) => paso.uses?.startsWith('actions/checkout@'));

    expect(checkouts.length).toBeGreaterThan(0);
    expect(checkouts.filter((paso) => paso.with?.['persist-credentials'] !== false)).toEqual([]);
  });

  it('no hay disparador pull_request_target ni workflow_run [US-036 AC-1]', () => {
    expect(Object.keys(workflow.on)).not.toContain('pull_request_target');
    expect(Object.keys(workflow.on)).not.toContain('workflow_run');
  });

  it('declara permissions contents: read en el nivel del workflow y ningún job las amplía [US-036 AC-1]', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(Object.values(workflow.jobs).filter((job) => job.permissions)).toEqual([]);
  });
});
