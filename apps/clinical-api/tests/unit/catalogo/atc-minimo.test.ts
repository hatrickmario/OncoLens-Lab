import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { crearProveedorDeCatalogo } from '../../../src/infrastructure/catalogo/catalog-version.provider.js';
import { crearCatalogoTerminologico } from '../../../src/infrastructure/catalogo/catalogo-terminologico.js';
import { createReconciliationService } from '../../../src/modules/reconciliation/reconciliation.service.js';
import { RUTA_CATALOGO_REAL } from '../../support/catalogo-terminologico.js';

interface EntradaDeCodigos {
  terminoCanonico: string;
  estandar: string;
  codigo: string;
  nombreOficial: string;
  versionFuente: string;
}

const leer = (archivo: string): string =>
  readFileSync(path.join(RUTA_CATALOGO_REAL, archivo), 'utf8');
const atcDe = (tipo: string): EntradaDeCodigos[] =>
  (JSON.parse(leer(`${tipo}/codigos.json`)) as { entradas: EntradaDeCodigos[] }).entradas.filter(
    (e) => e.estandar === 'atc',
  );

/**
 * Códigos y nombres verificados el 2026-11-03 en atcddd.fhi.no (ATC/DDD Index 2026, actualizado el 2026-01-20); el
 * nombre inglés se guarda literal y sin DDD (DEC-04).
 */
const VERIFICADOS = {
  prostata: [
    ['leuprorelina', 'L02AE02', 'leuprorelin'],
    ['bicalutamida', 'L02BB03', 'bicalutamide'],
    ['docetaxel', 'L01CD02', 'docetaxel'],
  ],
  mama: [
    ['trastuzumab', 'L01FD01', 'trastuzumab'],
    ['pertuzumab', 'L01FD02', 'pertuzumab'],
    ['trastuzumab emtansina', 'L01FD03', 'trastuzumab emtansine'],
    ['letrozol', 'L02BG04', 'letrozole'],
    ['docetaxel', 'L01CD02', 'docetaxel'],
  ],
} as const;

const PATRON_ATC = /^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$/;

describe('subconjunto de ATC del catálogo real (DEC-04)', () => {
  it.each(Object.entries(VERIFICADOS))(
    'cada fármaco verificado de %s tiene su entrada ATC con el nombre inglés literal y el año del índice [US-094 AC-1]',
    (tipo, esperados) => {
      const entradas = atcDe(tipo);

      expect(entradas.map((e) => [e.terminoCanonico, e.codigo, e.nombreOficial])).toEqual(
        esperados.map((e) => [...e]),
      );
      for (const entrada of entradas) {
        expect(entrada.codigo).toMatch(PATRON_ATC);
        expect(entrada.versionFuente).toContain('ATC/DDD Index 2026');
        expect(Object.keys(entrada)).not.toContain('ddd');
      }
    },
  );

  it('acompaña el subconjunto con el aviso de WHOCC y el manifest 1.8.0 [US-094 AC-1]', () => {
    const aviso = leer('NOTICE-atc.txt');

    expect(aviso).toContain('WHO Collaborating Centre for Drug Statistics Methodology');
    expect(aviso).toContain('non-commercial purposes only; not to be modified');
    expect(aviso).toContain('Uso académico no comercial');
    expect((JSON.parse(leer('manifest.json')) as { version: string }).version).toBe('1.8.0');
  });

  it.each([
    ['prostata', 'Leuprorelina', 'L02AE02'],
    ['prostata', 'Bicalutamida', 'L02BB03'],
    ['mama', 'Trastuzumab', 'L01FD01'],
    ['mama', 'T-DM1', 'L01FD03'],
  ])(
    'los fármacos de la demo de %s resuelven con ReconciliationService a su código ATC real: %s [US-094 AC-1] [RN-27]',
    (tipo, regimen, codigo) => {
      const proveedor = crearProveedorDeCatalogo(RUTA_CATALOGO_REAL, (r) =>
        readFileSync(r, 'utf8'),
      );
      const catalogo = crearCatalogoTerminologico(
        RUTA_CATALOGO_REAL,
        (r) => readFileSync(r, 'utf8'),
        proveedor,
      );

      const decision = createReconciliationService({ catalogo }).decidir({
        entidad: 'PriorTreatment',
        tipoDeCancer: tipo,
        textoOriginal: regimen,
      });

      expect(decision).toMatchObject({ mappingStatus: 'mapeado', atcCodes: [codigo] });
    },
  );
});
