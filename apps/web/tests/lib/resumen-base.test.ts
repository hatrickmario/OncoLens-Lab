import { describe, expect, it } from 'vitest';
import conEvidencia from '../../../../contracts/examples/con-evidencia-s1.json';
import sinEvidencia from '../../../../contracts/examples/sin-evidencia.json';
import { describirBusqueda } from '../../lib/evidence/describir-busqueda';
import { formatearFechaDeCorte, resumirBase } from '../../lib/evidence/resumen-base';
import { textoDeRevision } from '../../lib/evidence/texto-de-revision';

const base = conEvidencia.analysisBasis as never;
const consultadas = sinEvidencia.analysisBasis.sourcesConsulted as never;

describe('resumirBase', () => {
  it('cuenta cero y nombra ninguna cuando las listas están vacías', () => {
    const vacia = {
      ...conEvidencia.analysisBasis,
      missingCriticalData: [],
      assumptions: [],
      sourcesNotIncluded: [],
    } as never;
    expect(resumirBase(vacia)).toEqual({
      faltantes: 0,
      supuestos: 0,
      fuentesNoIncluidas: 'ninguna',
      omitidas: 0,
      supuestosDeCatalogo: [],
    });
  });

  it('une varias fuentes no incluidas y devuelve solo el texto de los supuestos de catálogo', () => {
    const resumen = resumirBase({
      ...conEvidencia.analysisBasis,
      assumptions: [
        { text: 'del catálogo', origin: 'regla_catalogo' },
        { text: 'de la IA', origin: 'llm_verificado' },
      ],
    } as never);
    expect(resumen.fuentesNoIncluidas).toBe('NCCN, ESMO');
    expect(resumen.faltantes).toBe(2);
    expect(resumen.supuestos).toBe(2);
    expect(resumen.supuestosDeCatalogo).toEqual(['del catálogo']);
  });
});

describe('formatearFechaDeCorte', () => {
  it('devuelve dd/mm/aaaa sin desfase de zona horaria cuando la fecha es el último día del mes', () => {
    expect(formatearFechaDeCorte('2026-09-30')).toBe('30/09/2026');
    expect(formatearFechaDeCorte('2026-01-01')).toBe('01/01/2026');
  });
});

describe('describirBusqueda', () => {
  it('nombra fuentes, filtros activos y fragmentos sobre el umbral', () => {
    expect(describirBusqueda(consultadas, 'sin_evidencia')).toBe(
      'Qué se buscó: fuentes Guías, Publicaciones · filtros solo biomarcadores relevantes, últimos 6 meses, publicado desde 2021 · 0 fragmentos sobre el umbral',
    );
  });

  it('dice filtros ninguno cuando ningún filtro está activo', () => {
    const sinFiltros = {
      ...(consultadas as object),
      filters: {
        historiaCompleta: false,
        soloBiomarcadoresRelevantes: false,
        ultimosSeisMeses: false,
        antecedentesFamiliares: false,
        publishedFromYear: null,
      },
    } as never;
    expect(describirBusqueda(sinFiltros, 'sin_evidencia')).toContain('filtros ninguno');
  });

  it('dice que no se consultó el corpus cuando el tipo no está habilitado', () => {
    expect(describirBusqueda(base, 'tipo_no_habilitado')).toBe(
      'No se consultó el corpus: tipo fuera de alcance',
    );
  });
});

describe('textoDeRevision', () => {
  it.each([
    ['verificado', 'Verificado'],
    ['corregido', 'Corregido'],
    ['requiere_revision', 'Por revisar'],
    ['auto_aceptado', 'Sin verificar'],
  ] as const)('devuelve %s como %s cuando no hay conflicto', (reviewStatus, texto) => {
    expect(textoDeRevision({ reviewStatus, conflict: false })).toBe(texto);
  });

  it('añade En conflicto en texto cuando hay conflicto', () => {
    expect(textoDeRevision({ reviewStatus: 'requiere_revision', conflict: true })).toBe(
      'Por revisar · En conflicto',
    );
  });
});
