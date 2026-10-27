import { describe, expect, it } from 'vitest';
import conEvidencia from '../../../../contracts/examples/con-evidencia-s1.json';
import sinEvidencia from '../../../../contracts/examples/sin-evidencia.json';
import { describirBusqueda } from '../../lib/evidence/describir-busqueda';
import {
  formatearFechaDeCorte,
  resumirBase,
  textoDeFaltantes,
} from '../../lib/evidence/resumen-base';
import { textoDeRevision } from '../../lib/evidence/texto-de-revision';

const base = conEvidencia.analysisBasis as never;
const consultadas = sinEvidencia.analysisBasis.sourcesConsulted as never;

describe('resumirBase', () => {
  it('cuenta cero y nombra ninguna cuando las listas están vacías', () => {
    const vacia = {
      ...conEvidencia.analysisBasis,
      missingCriticalData: [],
      continuedWithWarning: false,
      assumptions: [],
      sourcesNotIncluded: [],
    } as never;
    expect(resumirBase(vacia, 'con_evidencia')).toEqual({
      faltantes: 0,
      continuoConAviso: false,
      supuestos: 0,
      fuentesNoIncluidas: 'ninguna',
      omitidas: 0,
    });
  });

  it('une varias fuentes no incluidas y cuenta los faltantes y supuestos', () => {
    const resumen = resumirBase(
      {
        ...conEvidencia.analysisBasis,
        assumptions: [
          { text: 'del catálogo', origin: 'regla_catalogo' },
          { text: 'de la IA', origin: 'llm_verificado' },
        ],
      } as never,
      'con_evidencia',
    );
    expect(resumen.fuentesNoIncluidas).toBe('NCCN, ESMO');
    expect(resumen.faltantes).toBe(2);
    expect(resumen.supuestos).toBe(2);
  });

  it('refleja continuoConAviso solo cuando continuedWithWarning es true', () => {
    const conAviso = { ...conEvidencia.analysisBasis, continuedWithWarning: true } as never;
    const sinAviso = { ...conEvidencia.analysisBasis, continuedWithWarning: false } as never;
    expect(resumirBase(conAviso, 'con_evidencia').continuoConAviso).toBe(true);
    expect(resumirBase(sinAviso, 'con_evidencia').continuoConAviso).toBe(false);
  });

  it('deja faltantes en null cuando el tipo no está habilitado porque el checklist no se calculó', () => {
    expect(resumirBase(base, 'tipo_no_habilitado').faltantes).toBeNull();
  });
});

describe('textoDeFaltantes', () => {
  const resumen = (faltantes: number | null, continuoConAviso: boolean) =>
    ({
      faltantes,
      continuoConAviso,
      supuestos: 0,
      fuentesNoIncluidas: 'ninguna',
      omitidas: 0,
    }) as const;

  it.each([
    [0, '0 datos críticos faltantes'],
    [1, '1 dato crítico faltante'],
    [6, '6 datos críticos faltantes'],
  ])('devuelve %i como %s sin aviso', (n, texto) => {
    expect(textoDeFaltantes(resumen(n, false))).toBe(texto);
  });

  it('añade continuó con aviso cuando se continuó con aviso', () => {
    expect(textoDeFaltantes(resumen(6, true))).toBe(
      '6 datos críticos faltantes · continuó con aviso',
    );
  });

  it('dice no evaluados en este estado y nunca un contador cuando faltantes es null', () => {
    expect(textoDeFaltantes(resumen(null, false))).toBe(
      'Datos críticos faltantes: no evaluados en este estado',
    );
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

  it('devuelve null cuando hay evidencia porque el resumen no dice qué se buscó', () => {
    expect(describirBusqueda(consultadas, 'con_evidencia')).toBeNull();
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
