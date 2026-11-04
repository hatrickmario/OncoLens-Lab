import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  esEventoDeIa,
  type EventoDelCaso,
  rotuloOValor,
  separarSinFecha,
  valorConUnidad,
} from '../../lib/caso/presentacion';
import { mensajes } from '../../lib/mensajes';
import casoPCaso from '../../../../contracts/examples/case-view-p-caso.json';

describe('presentación de la vista de caso', () => {
  it('rotula los valores de atributo que siembra el catálogo (posmenopausica) en vez de mostrar el valor crudo [visual-check L1D-76]', () => {
    const { valoresDeAtributo } = mensajes().caso;
    expect(rotuloOValor(valoresDeAtributo, 'posmenopausica')).toBe('Posmenopáusica');
    expect(rotuloOValor(valoresDeAtributo, 'premenopausica')).toBe('Premenopáusica');
  });

  it('muestra el valor crudo cuando no hay rótulo', () => {
    expect(rotuloOValor({}, 'valor_nuevo')).toBe('valor_nuevo');
  });

  it('separa solo los eventos de fecha incierta sin reordenar', () => {
    const { fechados, sinFecha } = separarSinFecha(casoPCaso.timeline as never);
    expect(fechados).toHaveLength(10);
    expect(sinFecha.map((e) => e.eventType)).toEqual(['toxicidad']);
  });

  it('manda a Sin fecha confiable los eventos con eventDate null y deja en la línea de tiempo los que traen fecha, sea cual sea la precisión [US-090 AC-1]', () => {
    const base = casoPCaso.timeline[0] as never as EventoDelCaso;
    const sinFecha = { ...base, eventDate: null, datePrecision: 'incierta' } as EventoDelCaso;
    const conFechaIncierta = {
      ...base,
      eventDate: '2026-01-01',
      datePrecision: 'incierta',
    } as EventoDelCaso;

    const separados = separarSinFecha([base, sinFecha, conFechaIncierta]);

    expect(separados.sinFecha).toEqual([sinFecha]);
    expect(separados.fechados).toEqual([base, conFechaIncierta]);
  });

  it('coincide con el contrato: solo la toxicidad de P-CASO tiene eventDate null', () => {
    const nulos = casoPCaso.timeline.filter((e) => e.eventDate === null).map((e) => e.eventType);

    expect(separarSinFecha(casoPCaso.timeline as never).sinFecha.map((e) => e.eventType)).toEqual(
      nulos,
    );
  });

  it('coincide con TIPOS_DE_EVENTO_DE_IA de clinical-api: analisis_ia y resumen_caso [RN-24]', () => {
    const fuente = readFileSync(
      path.resolve(__dirname, '../../../clinical-api/src/modules/case-view/timeline.reglas.ts'),
      'utf8',
    );
    const bloque = /TIPOS_DE_EVENTO_DE_IA = \[([^\]]*)\]/.exec(fuente)?.[1] ?? '';
    const claves = [...bloque.matchAll(/TIPOS_DE_EVENTO\.(\w+)/g)].map((m) => m[1]!);
    const valores = claves.map((clave) => new RegExp(`${clave}:\\s*'(\\w+)'`).exec(fuente)?.[1]);

    expect(valores.sort()).toEqual(['analisis_ia', 'resumen_caso']);
    for (const tipo of valores) expect(esEventoDeIa(tipo!)).toBe(true);
    expect(esEventoDeIa('examen')).toBe(false);
  });

  it('reconoce solo análisis y resumen como eventos de IA', () => {
    expect(esEventoDeIa('analisis_ia')).toBe(true);
    expect(esEventoDeIa('resumen_caso')).toBe(true);
    expect(esEventoDeIa('examen')).toBe(false);
  });

  it('formatea el decimal con coma y omite la unidad ausente', () => {
    expect(valorConUnidad('4.1', 'ng/mL')).toBe('4,1 ng/mL');
    expect(valorConUnidad('Positivo', null)).toBe('Positivo');
  });
});
