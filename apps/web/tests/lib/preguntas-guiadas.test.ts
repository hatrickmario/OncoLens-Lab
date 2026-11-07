import { describe, expect, it } from 'vitest';
import fixture from '../../../../packages/clinical-catalogs/test/fixtures/temas-del-caso.json';
import { checkProhibitedTerms } from '../../../../packages/clinical-language/src/check-prohibited-terms';
import { loadProhibitedTerms } from '../../../../packages/clinical-language/src/load-prohibited-terms';
import {
  armarPreguntasGuiadas,
  type ResumenParaPreguntas,
} from '../../lib/conversacion/preguntas-guiadas';
import { catalogosGuiadas } from '../../lib/server/catalogo-guiadas';

const armar = (resumen: ResumenParaPreguntas) => armarPreguntasGuiadas(resumen, catalogosGuiadas);
const casoDelFixture = (id: string) =>
  fixture.casos.find((c) => c.id === id)!.patientSummary as unknown as ResumenParaPreguntas;

describe('armarPreguntasGuiadas', () => {
  it('ofrece tres preguntas del tipo y una del estadio cuando el caso de mama tiene estadio', () => {
    expect(armar(casoDelFixture('mama-completo'))).toEqual([
      '¿Cuál es la situación actual de esta paciente con Cáncer de mama?',
      '¿Qué información importante falta en el caso de Cáncer de mama?',
      '¿Qué evidencia hay para Cáncer de mama?',
      '¿Qué evidencia hay para Cáncer de mama en estadio IIA?',
    ]);
  });

  it('usa el biomarcador principal como cuarto tema cuando no hay estadio del catálogo', () => {
    const resumen = casoDelFixture('mama-solo-her2');
    const sinEstadio = {
      ...resumen,
      diagnosis: { ...resumen.diagnosis!, stageValue: 'Sin estadificar' },
    };

    expect(armar(sinEstadio).at(3)).toBe('¿Qué evidencia hay para Cáncer de mama con HER2?');
  });

  it('incluye el grado ISUP junto al estadio en el cuarto tema de próstata [US-267 AC-9]', () => {
    const preguntas = armar(casoDelFixture('prostata-con-grado'));

    expect(preguntas).toHaveLength(4);
    expect(preguntas[0]).toBe('¿Cuál es la situación actual de este paciente con Cáncer de próstata?');
    expect(preguntas[3]).toBe(
      '¿Qué evidencia hay para Cáncer de próstata en estadio IIB con grado ISUP 3?',
    );
  });

  it('ofrece solo las tres de tipo y ninguna del expediente cuando no hay estadio ni biomarcador [US-267 AC-10]', () => {
    const sembrado = {
      ...casoDelFixture('mama-sin-estadio-ni-biomarcador'),
      identification: { fullName: 'Nombre Sintético Sembrado', nationalId: 'SINT-0009999' },
      pseudoPatientId: 'pseudo-sembrado-1',
      id: '8f2b3c4d-9a1e-4b5c-8d6e-7f8091a2b3c4',
    };
    sembrado.diagnosis = {
      ...sembrado.diagnosis!,
      histology: 'texto libre sintético sembrado',
    } as typeof sembrado.diagnosis;

    const preguntas = armar(sembrado);

    expect(preguntas).toHaveLength(3);
    const junto = preguntas.join(' ');
    for (const ajeno of ['sembrado', 'SINT-', 'pseudo', '8f2b3c4d']) {
      expect(junto).not.toContain(ajeno);
    }
    expect(junto).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it('no ofrece nada cuando el paciente no tiene diagnóstico o su tipo no tiene etiqueta en el catálogo [US-267 AC-10]', () => {
    expect(armar({ diagnosis: null, recentBiomarkers: [] })).toEqual([]);
    expect(armar(casoDelFixture('tipo-sin-etiqueta'))).toEqual([]);
  });

  it('solo usa términos que el fixture compartido espera para cada caso [US-267 AC-9]', () => {
    for (const caso of fixture.casos) {
      const preguntas = armar(caso.patientSummary as unknown as ResumenParaPreguntas);
      const esperados = caso.salida.terminos;

      expect(preguntas.length > 0).toBe(esperados.length > 0);
      if (esperados.length > 0) expect(preguntas.join(' ')).toContain(esperados[0]);
      const conTermino = preguntas.filter((p) => esperados.some((t) => p.includes(t)));
      expect(conTermino).toHaveLength(preguntas.length);
    }
  });

  it('no usa términos prescriptivos en ninguna plantilla del catálogo [US-267 AC-9]', () => {
    const lista = loadProhibitedTerms();
    const plantillas = Object.values(catalogosGuiadas.plantillas).flatMap((p) =>
      p.items.flatMap((item) => item.variantes.map((v) => v.texto)),
    );

    expect(plantillas.length).toBeGreaterThanOrEqual(8);
    for (const texto of plantillas) {
      const hallazgos = checkProhibitedTerms(texto, lista, {
        niveles: ['A', 'B'],
        permitirFrases: true,
      });
      expect(hallazgos.map((h) => `${texto}: ${h.termino}`)).toEqual([]);
    }
  });
});
