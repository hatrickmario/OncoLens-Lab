import { describe, expect, it } from 'vitest';
import { construirContextoDelChat } from '../../../src/modules/evidence-analysis/clinical-context.builder.js';
import { construirHechosDelCaso } from '../../../src/modules/evidence-analysis/conversation/hechos-del-caso.js';
import {
  AHORA_DE_EJEMPLO,
  casoDeEjemplo,
  diagnosticoDeEjemplo,
  eventoDeEjemplo,
  tratamientoPrevioDeEjemplo,
} from './casos.js';
import type { FilaDeTratamientoPrevio } from '../../../src/modules/evidence-analysis/evidence-analysis.repository.js';

/**
 * `relativeEndDay` de los tratamientos previos (L1D-330, US-272): entero si hay fin (gana la fecha), `null` explícito si
 * está en curso, ausente en el resto. La fecha absoluta de fin no sale de Backend 1 (RN-11).
 */
function hechosConTratamiento(tratamiento: Partial<FilaDeTratamientoPrevio>) {
  const caso = casoDeEjemplo({
    diagnosticoActivo: diagnosticoDeEjemplo({ id: 'dx-1', diagnosedAt: '2026-01-10' }),
    biomarcadores: [],
    atributos: [],
    tratamientosPrevios: [tratamientoPrevioDeEjemplo({ id: 'tp-1', ...tratamiento })],
    eventos: [eventoDeEjemplo({ id: 'ev-1', eventDate: '2026-05-01', datePrecision: 'dia' })],
  });
  const { contexto, dataRefs } = construirContextoDelChat(caso, AHORA_DE_EJEMPLO, []);
  return construirHechosDelCaso(
    { ...contexto, pseudoPatientId: 'psd_TestPseudonimo0001' },
    dataRefs,
  );
}

const tratamientoDe = (hechos: ReturnType<typeof hechosConTratamiento>) => {
  const hecho = hechos.caseFacts.find((h) => h.kind === 'tratamiento');
  if (hecho === undefined) throw new Error('sin hecho de tratamiento');
  return hecho;
};

describe('construirHechosDelCaso: relativeEndDay', () => {
  it('envía el día de inicio y el de fin como enteros y ninguna fecha absoluta cuando el tratamiento terminó [US-272 AC-1]', () => {
    const hechos = hechosConTratamiento({
      startedAt: '2025-08-03',
      endedAt: '2025-11-11',
      ongoing: false,
    });

    const hecho = tratamientoDe(hechos);
    expect(hecho.relativeDay).toBe(-160);
    expect(hecho.relativeEndDay).toBe(-60);
    expect(JSON.stringify(hechos.caseFacts)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('serializa "relativeEndDay":null cuando el tratamiento está en curso [US-272 AC-2]', () => {
    const hechos = hechosConTratamiento({ startedAt: '2025-08-03', endedAt: null, ongoing: true });

    expect(JSON.stringify(tratamientoDe(hechos))).toContain('"relativeEndDay":null');
  });

  it('omite la propiedad cuando el fin es desconocido (ongoing = false sin endedAt) [US-272 AC-2]', () => {
    const hechos = hechosConTratamiento({ endedAt: null, ongoing: false });

    for (const hecho of hechos.caseFacts) expect(hecho).not.toHaveProperty('relativeEndDay');
  });

  it('usa el entero de endedAt aunque el tratamiento figure en curso [US-272 AC-2]', () => {
    const hechos = hechosConTratamiento({
      startedAt: '2025-08-03',
      endedAt: '2025-11-11',
      ongoing: true,
    });

    expect(tratamientoDe(hechos).relativeEndDay).toBe(-60);
  });

  it('omite la propiedad en los hechos que no son tratamientos previos [US-272 AC-2]', () => {
    const hechos = hechosConTratamiento({ endedAt: null, ongoing: true });

    for (const hecho of hechos.caseFacts.filter((h) => h.kind !== 'tratamiento'))
      expect(hecho).not.toHaveProperty('relativeEndDay');
  });

  it('no deja la fecha de fin ni relativeEndDay en los enlaces hacia el navegador [US-272 AC-3]', () => {
    const hechos = hechosConTratamiento({
      startedAt: '2025-08-03',
      endedAt: '2025-11-11',
      ongoing: false,
    });

    const texto = JSON.stringify([...hechos.enlaces.values()]);
    expect(texto).not.toContain('2025-11-11');
    expect(texto).not.toContain('relativeEndDay');
  });
});
