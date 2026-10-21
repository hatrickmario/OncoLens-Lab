/**
 * Casos de `contracts:breaking` (US-214 AC-5, ADR-26) sobre un clon temporal: la base es el commit inicial del clon y
 * HEAD es el árbol de trabajo editado. Se prueba el script real, con `oasdiff` real, sobre los specs reales.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { PATHS } from '../../contracts/lib/paths.mjs';
import { CLINICAL_API, RAG_ORCHESTRATOR } from '../../contracts/lib/specs.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../../..');
const TIEMPO_MAXIMO_MS = 120_000;
const COPIAR = ['scripts/ci/contracts-breaking.sh', 'scripts/ci/bundle-specs.mjs', 'scripts/ci/contracts-breaking-excepciones.json', 'scripts/ci/lib', 'scripts/contracts/lib', 'scripts/contracts/redocly.yaml', 'contracts', 'package.json', ...Object.values(PATHS.specs).filter((archivo) => archivo.startsWith('apps/'))];

let clon;

const git = (...args) => execFileSync('git', ['-C', clon, ...args], { maxBuffer: 64 * 1024 * 1024 });

beforeEach(() => {
  clon = mkdtempSync(path.join(tmpdir(), 'breaking-clon-'));
  for (const relativa of COPIAR) {
    mkdirSync(path.dirname(path.join(clon, relativa)), { recursive: true });
    cpSync(path.join(RAIZ, relativa), path.join(clon, relativa), { recursive: true });
  }
  symlinkSync(path.join(RAIZ, 'node_modules'), path.join(clon, 'node_modules'));
  git('init', '-q');
  git('-c', 'user.name=ci', '-c', 'user.email=ci@example.invalid', 'add', '-A', '.');
  git('-c', 'user.name=ci', '-c', 'user.email=ci@example.invalid', 'commit', '-q', '-m', 'base');
});
afterEach(() => rmSync(clon, { recursive: true, force: true }));

/** Edita el spec del proveedor en el clon con `editar(documentoYaml)`. */
function editarSpec(proveedor, editar) {
  const archivo = path.join(clon, PATHS.specs[proveedor]);
  const documento = YAML.parseDocument(readFileSync(archivo, 'utf8'));
  editar(documento);
  writeFileSync(archivo, String(documento));
}

const eliminarCampoDeRespuesta = (documento) => documento.deleteIn(['components', 'schemas', 'HealthStatus', 'properties', 'status']);
const volverObligatorioUnCampoDeRequest = (documento) => documento.addIn(['components', 'schemas', 'RagQueryInternalRequest', 'required'], 'agentLimits');

function ejecutarBreaking() {
  const resultado = spawnSync('bash', [path.join(clon, 'scripts/ci/contracts-breaking.sh'), 'HEAD'], { encoding: 'utf8', cwd: clon });
  return { codigo: resultado.status, salida: `${resultado.stdout}\n${resultado.stderr}` };
}

/** Los ERR de oasdiff (JSON) de un proveedor entre la base (HEAD del clon) y el árbol de trabajo. */
function hallazgosDe(proveedor) {
  const base = path.join(clon, 'base');
  mkdirSync(base);
  execFileSync('tar', ['-x', '-C', base], { input: git('archive', 'HEAD', 'apps', 'contracts'), maxBuffer: 64 * 1024 * 1024 });
  execFileSync('node', [path.join(clon, 'scripts/ci/bundle-specs.mjs'), base, path.join(clon, 'base-out')]);
  execFileSync('node', [path.join(clon, 'scripts/ci/bundle-specs.mjs'), clon, path.join(clon, 'head-out')]);
  const resultado = spawnSync('oasdiff', ['breaking', path.join(clon, 'base-out', `${proveedor}.json`), path.join(clon, 'head-out', `${proveedor}.json`), '--format', 'json', '--allow-external-refs=false'], { encoding: 'utf8' });
  return JSON.parse(resultado.stdout);
}

function declararExcepcion(proveedor, hallazgo, id) {
  const archivo = path.join(clon, 'scripts/ci/contracts-breaking-excepciones.json');
  const excepciones = JSON.parse(readFileSync(archivo, 'utf8'));
  excepciones.push({ id, adr: 'ADR-26', documento: 'ADR-26-contrato-congelado-y-excepciones-declaradas.md', change: 'cambio-de-prueba', proveedor, regla: hallazgo.id, operacion: hallazgo.operation, ruta: hallazgo.path, texto: hallazgo.text });
  writeFileSync(archivo, JSON.stringify(excepciones, null, 2));
}

describe('contracts:breaking sobre un clon temporal', () => {
  it('termina con 0 y declara que no hay cambios incompatibles cuando los specs no cambian [US-214 AC-5]', () => {
    const { codigo, salida } = ejecutarBreaking();

    expect(salida).toContain('sin cambios incompatibles');
    expect(codigo).toBe(0);
  }, TIEMPO_MAXIMO_MS);

  it('termina con código distinto de 0 nombrando el proveedor cuando se elimina un campo de una respuesta [US-214 AC-5] [ADR-26]', () => {
    editarSpec(CLINICAL_API, eliminarCampoDeRespuesta);

    const { codigo, salida } = ejecutarBreaking();

    expect(codigo).not.toBe(0);
    expect(salida).toContain('contracts-breaking — clinical-api: cambio incompatible');
  }, TIEMPO_MAXIMO_MS);

  it('termina con código distinto de 0 nombrando el proveedor cuando un campo del request pasa a ser obligatorio [US-214 AC-5] [ADR-26]', () => {
    editarSpec(RAG_ORCHESTRATOR, volverObligatorioUnCampoDeRequest);

    const { codigo, salida } = ejecutarBreaking();

    expect(codigo).not.toBe(0);
    expect(salida).toContain('contracts-breaking — rag-orchestrator: cambio incompatible');
  }, TIEMPO_MAXIMO_MS);

  it('termina con 0 e imprime la excepción aplicada cuando el cambio incompatible está declarado con su E-n [US-214 AC-5] [ADR-26]', () => {
    editarSpec(CLINICAL_API, eliminarCampoDeRespuesta);
    const errores = hallazgosDe(CLINICAL_API).filter((hallazgo) => hallazgo.level === 3);
    expect(errores.length).toBeGreaterThan(0);
    errores.forEach((hallazgo, indice) => declararExcepcion(CLINICAL_API, hallazgo, `E-9${indice}`));

    const { codigo, salida } = ejecutarBreaking();

    expect(salida).toContain('clinical-api: excepción aplicada E-90');
    expect(salida).toContain('los ERR son excepciones declaradas');
    expect(codigo).toBe(0);
  }, TIEMPO_MAXIMO_MS);

  it('sigue rompiendo cuando la excepción declarada es de otro proveedor [US-214 AC-5] [ADR-26]', () => {
    editarSpec(CLINICAL_API, eliminarCampoDeRespuesta);
    hallazgosDe(CLINICAL_API)
      .filter((hallazgo) => hallazgo.level === 3)
      .forEach((hallazgo, indice) => declararExcepcion(RAG_ORCHESTRATOR, hallazgo, `E-9${indice}`));

    const { codigo, salida } = ejecutarBreaking();

    expect(codigo).not.toBe(0);
    expect(salida).not.toContain('excepción aplicada');
  }, TIEMPO_MAXIMO_MS);
});
