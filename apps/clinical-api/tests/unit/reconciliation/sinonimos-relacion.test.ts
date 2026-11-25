import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RUTA_CATALOGO_FX01BB, RUTA_CATALOGO_REAL } from '../../support/catalogo-terminologico.js';
import { servicioSobreCatalogo } from '../../support/reconciliation.js';

/** Relación de cada sinónimo con su término canónico (L1D-335, US-277, revisión clínica S-1). */
type Relacion = 'equivalente' | 'mas_amplio' | 'miembro_de_clase';
const sinonimo = (texto: string, relacion: Relacion) => ({ texto, idioma: 'es', relacion });

let directorio: string;
beforeEach(() => {
  directorio = mkdtempSync(path.join(tmpdir(), 'sinonimos-relacion-'));
  cpSync(RUTA_CATALOGO_FX01BB, directorio, { recursive: true });
});
afterEach(() => rmSync(directorio, { recursive: true, force: true }));

function conSinonimosDeProstata(...sinonimos: ReturnType<typeof sinonimo>[]) {
  writeFileSync(
    path.join(directorio, 'prostata/sinonimos.json'),
    JSON.stringify({
      version: '1.0.0',
      items: [{ terminoCanonico: 'leuprorelina', sinonimos }],
    }),
  );
  return servicioSobreCatalogo(directorio).servicio;
}

const tratamiento = (textoOriginal: string) => ({
  entidad: 'PriorTreatment' as const,
  tipoDeCancer: 'prostata',
  textoOriginal,
});

describe('ReconciliationService: solo un sinónimo equivalente resuelve a su término canónico', () => {
  it('mapea leuprolide al código de leuprorelina cuando el sinónimo es equivalente [US-277 AC-1]', () => {
    const servicio = conSinonimosDeProstata(sinonimo('leuprolide', 'equivalente'));

    const decision = servicio.decidir(tratamiento('leuprolide'));

    expect(decision).toMatchObject({ mappingStatus: 'mapeado', atcCodes: ['L02AE02'] });
  });

  it('deja no_mapeado el texto que solo es miembro_de_clase [US-277 AC-1]', () => {
    const servicio = conSinonimosDeProstata(
      sinonimo('leuprolide', 'equivalente'),
      sinonimo('Eligard', 'miembro_de_clase'),
    );

    const decision = servicio.decidir(tratamiento('Eligard'));

    expect(decision).toMatchObject({
      mappingStatus: 'no_mapeado',
      atcCodes: [],
      originalName: 'Eligard',
    });
  });

  it('deja no_mapeado el texto que solo es mas_amplio [US-277 AC-1]', () => {
    const servicio = conSinonimosDeProstata(sinonimo('terapia hormonal', 'mas_amplio'));

    const decision = servicio.decidir(tratamiento('terapia hormonal'));

    expect(decision).toMatchObject({ mappingStatus: 'no_mapeado', atcCodes: [] });
  });

  it('no mapea pertuzumab desde el doble bloqueo anti-HER2 en el catálogo real [US-277 AC-1]', () => {
    const { servicio } = servicioSobreCatalogo(RUTA_CATALOGO_REAL);

    const decision = servicio.decidir({
      entidad: 'PriorTreatment',
      tipoDeCancer: 'mama',
      textoOriginal: 'doble bloqueo anti-HER2',
    });

    expect(decision.mappingStatus).toBe('no_mapeado');
  });
});
