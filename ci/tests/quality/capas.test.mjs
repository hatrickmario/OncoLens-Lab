import { cpSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIZ, binLocal, ejecutar } from './soporte.mjs';

const FIXTURES_CAPAS = path.join(import.meta.dirname, 'fixtures/capas');
const CONFIGURACION = path.join(RAIZ, '.dependency-cruiser.cjs');

/**
 * Copia el árbol de un fixture a un directorio FUERA de node_modules (os.tmpdir) con `node_modules` enlazado a
 * la raíz, y corre dependency-cruiser desde allí: las dependencias de terceros resuelven a `node_modules/...`
 * con la misma forma que en el árbol real (un directorio bajo node_modules/.cache daba un verde falso).
 */
function cruzar(caso) {
  const destino = mkdtempSync(path.join(tmpdir(), 'oncolens-capas-'));
  cpSync(path.join(FIXTURES_CAPAS, caso), destino, { recursive: true });
  symlinkSync(path.join(RAIZ, 'node_modules'), path.join(destino, 'node_modules'), 'dir');
  return ejecutar(binLocal('depcruise'), ['.', '--config', CONFIGURACION, '--output-type', 'err'], {
    cwd: destino,
  });
}

describe('reglas de capas de dependency-cruiser', () => {
  it('pasa cuando un controller solo usa su service y un componente no importa datos [US-213 AC-2]', () => {
    expect(cruzar('limpio').estado).toBe(0);
  });

  it('falla con controller-sin-acceso-a-datos y nombra el archivo cuando un controller importa @prisma/client [US-213 AC-2]', () => {
    const resultado = cruzar('controller-prisma');

    expect(resultado.estado).not.toBe(0);
    expect(resultado.salida).toContain('controller-sin-acceso-a-datos');
    expect(resultado.salida).toContain('apps/clinical-api/src/modules/x/x.controller.ts');
  });

  it('falla con controller-sin-acceso-a-datos cuando un controller importa un repository [US-213 AC-2]', () => {
    const resultado = cruzar('controller-repository');

    expect(resultado.estado).not.toBe(0);
    expect(resultado.salida).toContain('controller-sin-acceso-a-datos');
    expect(resultado.salida).toContain('x.repository.ts');
  });

  it('falla con test-support-solo-en-tests y nombra el archivo cuando un service de producción importa packages/test-support [US-213 AC-10]', () => {
    const resultado = cruzar('test-support-en-produccion');

    expect(resultado.estado).not.toBe(0);
    expect(resultado.salida).toContain('test-support-solo-en-tests');
    expect(resultado.salida).toContain('apps/clinical-api/src/modules/x/x.service.ts');
  });

  it('pasa cuando un test importa packages/test-support [US-213 AC-10]', () => {
    expect(cruzar('test-support-en-tests').estado).toBe(0);
  });

  it('falla con web-solo-por-bff y nombra el archivo cuando web importa código de clinical-api [US-213 AC-2]', () => {
    const resultado = cruzar('web-clinical-api');

    expect(resultado.estado).not.toBe(0);
    expect(resultado.salida).toContain('web-solo-por-bff');
    expect(resultado.salida).toContain('apps/web/lib/cliente.ts');
  });

  it('falla con componentes-sin-datos y nombra el archivo cuando un componente importa @prisma/client [US-213 AC-2]', () => {
    const resultado = cruzar('componente-prisma');

    expect(resultado.estado).not.toBe(0);
    expect(resultado.salida).toContain('componentes-sin-datos');
    expect(resultado.salida).toContain('apps/web/components/organisms/panel.tsx');
  });

  it('falla con controller-sin-acceso-a-datos cuando un controller importa pg [US-213 AC-2]', () => {
    const resultado = cruzar('controller-pg');

    expect(resultado.estado).not.toBe(0);
    expect(resultado.salida).toContain('controller-sin-acceso-a-datos');
    expect(resultado.salida).toContain('apps/clinical-api/src/modules/x/x.controller.ts');
  });

  it('falla con componentes-sin-datos cuando un componente importa pg [US-213 AC-2]', () => {
    const resultado = cruzar('componente-pg');

    expect(resultado.estado).not.toBe(0);
    expect(resultado.salida).toContain('componentes-sin-datos');
  });

  it('falla con componentes-sin-datos cuando un componente importa un cliente HTTP como undici [US-213 AC-2]', () => {
    const resultado = cruzar('componente-undici');

    expect(resultado.estado).not.toBe(0);
    expect(resultado.salida).toContain('componentes-sin-datos');
  });

  it('falla con sin-ciclos y nombra los archivos cuando dos módulos se importan entre sí [US-213 AC-2]', () => {
    const resultado = cruzar('ciclo');

    expect(resultado.estado).not.toBe(0);
    expect(resultado.salida).toContain('sin-ciclos');
    expect(resultado.salida).toContain('apps/clinical-api/src/a.ts');
  });

  it('falla con api-contracts-generado cuando un archivo importa un interno del generador [US-213 AC-2]', () => {
    const resultado = cruzar('contracts-interno');

    expect(resultado.estado).not.toBe(0);
    expect(resultado.salida).toContain('api-contracts-generado');
    expect(resultado.salida).toContain('apps/clinical-api/src/uso.ts');
  });

  it('falla con api-contracts-generado cuando web importa el contrato de rag-orchestrator [US-213 AC-2]', () => {
    const resultado = cruzar('web-contrato-rag');

    expect(resultado.estado).not.toBe(0);
    expect(resultado.salida).toContain('web-sin-contrato-rag');
    expect(resultado.salida).toContain('apps/web/lib/rag.ts');
  });
});
