import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PROVIDERS } from '../../contracts/lib/specs.mjs';
import { DECISION_PERDONADO, errNoDeclarados } from '../lib/excepcionesDeContrato.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../../..');
const EXCEPCIONES = JSON.parse(readFileSync(path.join(RAIZ, 'scripts/ci/contracts-breaking-excepciones.json'), 'utf8'));

const ERR = 3;
const WARN = 2;
const HALLAZGO_422 = {
  id: 'response-body-one-of-added',
  text: 'added `#/components/schemas/ErrorTipoCancerNoRegistrado` to the response body `oneOf` list for the response status `422`',
  level: ERR,
  operation: 'POST',
  path: '/rag/query',
};
const PROVEEDOR = 'rag-orchestrator';

describe('errNoDeclarados (ADR-26)', () => {
  it('no devuelve el ERR del 422 TIPO_CANCER_NO_REGISTRADO cuando está declarado como excepción', () => {
    expect(errNoDeclarados(PROVEEDOR, [HALLAZGO_422], EXCEPCIONES)).toEqual([]);
  });

  it('devuelve el mismo ERR cuando lo reporta otro proveedor', () => {
    expect(errNoDeclarados('clinical-api', [HALLAZGO_422], EXCEPCIONES)).toEqual([HALLAZGO_422]);
  });

  it('devuelve un ERR de la misma regla y ruta cuando el schema añadido es otro', () => {
    const otro = { ...HALLAZGO_422, text: HALLAZGO_422.text.replace('ErrorTipoCancerNoRegistrado', 'ErrorOtro') };
    expect(errNoDeclarados(PROVEEDOR, [otro], EXCEPCIONES)).toEqual([otro]);
  });

  it('devuelve un ERR de otra regla sobre la misma operación', () => {
    const otro = { ...HALLAZGO_422, id: 'response-property-removed', text: 'removed `status`' };
    expect(errNoDeclarados(PROVEEDOR, [otro], EXCEPCIONES)).toEqual([otro]);
  });

  it('devuelve el mismo ERR cuando cambia la ruta', () => {
    const otro = { ...HALLAZGO_422, path: '/case/summary' };
    expect(errNoDeclarados(PROVEEDOR, [otro], EXCEPCIONES)).toEqual([otro]);
  });

  it.each(['ERR', '3', null, undefined])('trata como ERR no declarado un hallazgo con level %s (no numérico)', (level) => {
    const raro = { ...HALLAZGO_422, id: 'otro', level };
    expect(errNoDeclarados(PROVEEDOR, [raro], EXCEPCIONES)).toEqual([raro]);
  });

  it('ignora los avisos (WARN) y conserva solo los ERR no declarados', () => {
    const aviso = { ...HALLAZGO_422, id: 'response-body-wrapped-in-one-of-original-preserved', level: WARN };
    const otroErr = { ...HALLAZGO_422, id: 'request-body-type-changed', text: 'otro' };
    expect(errNoDeclarados(PROVEEDOR, [aviso, HALLAZGO_422, otroErr], EXCEPCIONES)).toEqual([otroErr]);
  });
});

describe('excepciones E-4 y E-5 (422 de la carga de documentos)', () => {
  const hallazgo = (valor) => ({
    id: 'response-property-enum-value-added',
    text: `added the new \`${valor}\` enum value to the \`error\` response property for the response status \`422\``,
    level: ERR,
    operation: 'POST',
    path: '/platform/patients/{patientId}/documents',
  });

  it.each(['ARCHIVO_NO_PDF', 'ARCHIVO_DEMASIADO_GRANDE'])('no devuelve el ERR del valor %s cuando está declarado', (valor) => {
    expect(errNoDeclarados('clinical-api', [hallazgo(valor)], EXCEPCIONES)).toEqual([]);
  });

  it('devuelve el ERR de un valor distinto en la misma ruta', () => {
    const otro = hallazgo('ARCHIVO_CORRUPTO');
    expect(errNoDeclarados('clinical-api', [otro], EXCEPCIONES)).toEqual([otro]);
  });

  it('devuelve el mismo valor en otra ruta', () => {
    const otro = { ...hallazgo('ARCHIVO_NO_PDF'), path: '/platform/patients/{patientId}/biomarkers' };
    expect(errNoDeclarados('clinical-api', [otro], EXCEPCIONES)).toEqual([otro]);
  });
});

describe('CLI de excepcionesDeContrato (falla cerrado)', () => {
  const directorio = mkdtempSync(path.join(tmpdir(), 'excepciones-'));
  const enlace = path.join(directorio, 'filtro.mjs');
  symlinkSync(path.join(RAIZ, 'scripts/ci/lib/excepcionesDeContrato.mjs'), enlace);
  afterAll(() => rmSync(directorio, { recursive: true, force: true }));

  // Por la ruta del enlace: process.argv[1] no es la ruta real (en macOS /var es un enlace a /private/var).
  const ejecutarCli = (hallazgos) =>
    spawnSync('node', [enlace, PROVEEDOR], { input: JSON.stringify(hallazgos), encoding: 'utf8' });

  it('sale con 1 cuando lo lanza una ruta con enlace simbólico y hay un ERR no declarado', () => {
    const noDeclarado = { ...HALLAZGO_422, id: 'request-body-type-changed', text: 'otro' };
    const resultado = ejecutarCli([HALLAZGO_422, noDeclarado]);

    expect(resultado.status).toBe(1);
    expect(resultado.stdout).toContain('ERR no declarado');
  });

  it('sale con 0 y emite la decisión explícita cuando el único ERR es la excepción E-1', () => {
    const resultado = ejecutarCli([HALLAZGO_422]);

    expect(resultado.status).toBe(0);
    expect(resultado.stdout).toContain(DECISION_PERDONADO);
  });

  it('sale con 1 cuando ningún ERR coincide con una excepción (nada que perdonar)', () => {
    const resultado = ejecutarCli([]);

    expect(resultado.status).toBe(1);
    expect(resultado.stdout).not.toContain(DECISION_PERDONADO);
  });

  it('sale con 1 cuando el level de un hallazgo no es numérico, aunque sea la excepción E-1', () => {
    const resultado = ejecutarCli([HALLAZGO_422, { ...HALLAZGO_422, id: 'otro', level: 'ERR' }]);

    expect(resultado.status).toBe(1);
  });

  it('sale con 1 cuando la entrada no es JSON', () => {
    const resultado = spawnSync('node', [enlace, PROVEEDOR], { input: 'no es json', encoding: 'utf8' });

    expect(resultado.status).toBe(1);
  });
});

describe('contracts-breaking-excepciones.json', () => {
  it('declara solo las excepciones E-1…E-17 (422 TIPO_CANCER_NO_REGISTRADO, 503 NLI_UNAVAILABLE, 422 ARCHIVO_NO_PDF / ARCHIVO_DEMASIADO_GRANDE de la carga los cuatro valores nuevos de unknownReason y, de L1D-295, ErrorSalidaLlmInvalida y lenguaje_no_permitido, en ambos proveedores), cada una con su ADR-26 y un proveedor válido', () => {
    expect(EXCEPCIONES.map((excepcion) => excepcion.id)).toEqual(Array.from({ length: 17 }, (_, i) => `E-${i + 1}`));
    for (const excepcion of EXCEPCIONES) {
      expect(PROVIDERS).toContain(excepcion.proveedor);
      expect(excepcion.adr).toBe('ADR-26');
      expect(existsSync(path.join(RAIZ, 'docs/architecture/adr', excepcion.documento))).toBe(true);
    }
  });
});
