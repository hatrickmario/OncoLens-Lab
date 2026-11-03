import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkProhibitedTerms, loadProhibitedTerms } from '../src/index.js';
import type { Nivel } from '../src/index.js';

interface CasoDeConformidad {
  id: string;
  grupo: string;
  texto: string;
  niveles: Nivel[];
  permitirFrases: boolean;
  soloIdsB?: string[];
  esperado: { id: string; nivel: Nivel }[];
}

const lista = () => loadProhibitedTerms();
const idsDe = (texto: string, opciones?: Parameters<typeof checkProhibitedTerms>[2]) =>
  checkProhibitedTerms(texto, lista(), opciones).map((coincidencia) => coincidencia.id);

const casos: CasoDeConformidad[] = JSON.parse(
  readFileSync(new URL('../conformidad/casos.json', import.meta.url), 'utf8'),
).casos;

describe('checkProhibitedTerms', () => {
  it('devuelve una coincidencia por cada variante de mayúsculas, tildes y puntuación y ninguna con "Opciones descritas en la evidencia" [US-068 AC-2]', () => {
    expect(idsDe('RECOMENDADO PARA ESTE PACIENTE')).toEqual(['es-recomendado-para-este-paciente']);
    expect(idsDe('Recomendado para este paciente.')).toEqual(['es-recomendado-para-este-paciente']);
    expect(idsDe('debe recibir')).toEqual(['es-debe-recibir']);
    expect(idsDe('Opciones descritas en la evidencia')).toEqual([]);
  });

  it('devuelve una coincidencia para deben recibir, recomendada para esta paciente y debe recibirlo [US-068 AC-2]', () => {
    expect(idsDe('deben recibir')).toEqual(['es-deben-recibir']);
    expect(idsDe('recomendada para esta paciente')).toEqual(['es-recomendado-para-este-paciente']);
    expect(idsDe('debe recibirlo')).toEqual(['es-debe-recibir']);
    expect(idsDe('debe recibirse')).toEqual(['es-debe-recibir']);
  });

  it('aplica la raíz recomend solo cuando se piden los niveles A y B [US-068 AC-5]', () => {
    const texto = 'La guía recomienda el esquema X';

    expect(idsDe(texto, { niveles: ['A'] })).toEqual([]);
    expect(
      checkProhibitedTerms(texto, lista(), { niveles: ['A', 'B'], permitirFrases: true }),
    ).toEqual([{ id: 'b-recomiend', termino: 'recomiend', nivel: 'B' }]);
  });

  it('devuelve una coincidencia por cada forma dirigida, deóntica o negativa de S1 resp. 33 y cuenta no debe recibir una sola vez [US-068 AC-2]', () => {
    const esperados: [string, string][] = [
      ['administre trastuzumab', 'es-administre'],
      ['No administre trastuzumab', 'es-administre'],
      ['Adminístrelo cada 3 semanas', 'es-administre'],
      ['no debe recibir', 'es-no-debe-recibir'],
      ['No se debe administrar en embarazo', 'es-no-se-debe-administrar'],
      ['debe iniciarse en las 12 semanas', 'es-debe-iniciar'],
      ['es necesaria una biopsia', 'es-es-necesario'],
      ['no está indicado', 'es-esta-indicado'],
      ['la mejor opción es trastuzumab', 'es-la-mejor-opcion-es'],
      ['Se recomienda trastuzumab', 'es-se-recomienda'],
      ['Trastuzumab is recommended', 'en-is-recommended'],
    ];

    for (const [texto, id] of esperados) expect(idsDe(texto), texto).toEqual([id]);
  });

  it('no devuelve coincidencias de Nivel A en los usos descriptivos como los ensayos evaluaron administrar trastuzumab [US-068 AC-2]', () => {
    const descriptivos = [
      'los ensayos evaluaron administrar trastuzumab',
      'la guía recomienda X para pacientes con HER2 positivo',
      'el fármaco se administra cada 3 semanas',
      'la paciente inicia tratamiento',
      'fecha de inicio del tratamiento',
      'el cambio a trastuzumab',
      'la toxicidad se debe a la quimioterapia',
      'como se indica en la tabla',
    ];

    for (const texto of descriptivos) expect(idsDe(texto), texto).toEqual([]);
  });

  it('no devuelve coincidencias en ningún nivel para los literales del S1 de L1D-140 y L1D-194 [US-068 AC-2]', () => {
    const literales = [
      'Relevancia de recuperación de evidencia',
      'Metadato secundario: no mide eficacia ni solidez clínica',
      'Ordenado por relevancia de recuperación de la búsqueda; no representa prioridad ni aplicabilidad clínica.',
      'Orden basado en la cita recuperada más relevante asociada a cada opción',
      'No resume la aplicabilidad, la eficacia ni la calidad global de la opción.',
      'Registro solo para auditoría: no es contenido clínico utilizable.',
      'Reintentar',
      'Análisis no realizado: falta el tipo de cáncer; no fue posible filtrar la evidencia.',
      'Generado por IA; requiere validación clínica independiente por el oncólogo tratante.',
      'Uso académico/investigación',
    ];

    for (const texto of literales) {
      expect(idsDe(texto, { niveles: ['A', 'B'] }), texto).toEqual([]);
    }
  });

  it('da los id y niveles esperados en cada caso de conformidad y nombra el id y el grupo del caso que falla [US-068 AC-2] [US-249 AC-3]', () => {
    expect(casos.length).toBeGreaterThan(100);
    expect(new Set(casos.map((caso) => caso.id)).size).toBe(casos.length);

    for (const caso of casos) {
      const obtenido = checkProhibitedTerms(caso.texto, lista(), {
        niveles: caso.niveles,
        permitirFrases: caso.permitirFrases,
        soloIdsB: caso.soloIdsB,
      }).map(({ id, nivel }) => ({ id, nivel }));

      expect(obtenido, `${caso.id} [${caso.grupo}]: "${caso.texto}"`).toEqual(caso.esperado);
    }
  });

  it('trae casos positivos y negativos de voz propia en los casos compartidos con Python', () => {
    const voces = casos.filter((caso) => caso.id.startsWith('VP-'));

    expect(voces.length).toBeGreaterThanOrEqual(20);
    expect(voces.filter((caso) => caso.esperado.length > 0).length).toBeGreaterThanOrEqual(15);
  });

  it('limita el Nivel B a los ids de soloIdsB cuando se piden los niveles A y B [US-249 AC-2]', () => {
    const texto = 'La guía recomienda evaluar administrar trastuzumab';
    const ids = (soloIdsB?: string[]) =>
      checkProhibitedTerms(texto, lista(), { niveles: ['A', 'B'], soloIdsB }).map((c) => c.id);

    expect(ids()).toEqual(['b-recomiend', 'b-es-administrar']);
    expect(ids(['b-recomiend'])).toEqual(['b-recomiend']);
    expect(ids([])).toEqual([]);
  });
});
