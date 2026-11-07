import { describe, expect, it } from 'vitest';
import type {
  DatosCriticosDeUnTipo,
  ItemDeDatoCritico,
} from '../../../src/modules/completeness/ports.js';
import { opcionesDeRegistroManual } from '../../../src/modules/manual-entry/manual-entry.reglas.js';
import type { FuenteDeOpciones } from '../../../src/modules/manual-entry/ports.js';
import type { EntradaDeCodigo } from '../../../src/modules/reconciliation/ports.js';

function item(
  key: string,
  destination: ItemDeDatoCritico['destination'],
  label = key,
): ItemDeDatoCritico {
  return {
    key,
    label,
    cancerType: 'x',
    destination,
    minValues: 1,
    sourceDocumentTypes: ['examen'],
  };
}

const ITEMS: Record<string, readonly ItemDeDatoCritico[]> = {
  mama: [
    item('grado', { entity: 'Diagnosis', field: 'grade' }, 'Grado'),
    item('ki67', { entity: 'Biomarker', field: 'value', match: { name: 'Ki-67' } }, 'Ki-67'),
    item('tratamientos', { entity: 'PriorTreatment' }, 'Tratamientos previos'),
  ],
  prostata: [
    item('psa', { entity: 'Biomarker', field: 'value', match: { name: 'PSA' } }, 'Serie de PSA'),
    item('grado', { entity: 'Diagnosis', field: 'grade' }, 'Grado'),
  ],
};

const LOINC: Record<string, readonly string[]> = {
  mama: ['Ki-67', 'RE'],
  prostata: ['PSA'],
};

const ESTADIFICACION: Record<string, readonly string[]> = {
  mama: ['TNM_8'],
  prostata: ['TNM_8'],
};
const estadificacionDe = (tipo: string): readonly string[] => ESTADIFICACION[tipo] ?? [];
const ESCALAS_FUNCIONALES = [{ codigo: 'ECOG', minimo: 0, maximo: 5 }];
const GRADACION: Record<string, readonly string[]> = {
  mama: ['nottingham'],
  prostata: ['gleason_isup'],
};

function gradacionDe(tipo: string): readonly string[] {
  return GRADACION[tipo] ?? [];
}

/** Coherente con `crearCatalogoDeEscalas`: la validez y el rango salen de las mismas tablas que las listas. */
function fuente(sobrescribe: Partial<FuenteDeOpciones> = {}): FuenteDeOpciones {
  return {
    escalas: {
      version: () => 'v-test',
      sistemaDeEstadificacionValido: (sistema, tipo) => estadificacionDe(tipo).includes(sistema),
      rangoDeEscala: (escala) => {
        const encontrada = ESCALAS_FUNCIONALES.find((e) => e.codigo === escala);
        return encontrada && { minimo: encontrada.minimo, maximo: encontrada.maximo };
      },
      sistemaDeGradacionValido: (sistema, tipo) => gradacionDe(tipo).includes(sistema),
      sistemasDeEstadificacion: (tipo) => estadificacionDe(tipo),
      escalasFuncionales: () => ESCALAS_FUNCIONALES,
      sistemasDeGradacion: (tipo) => gradacionDe(tipo),
    },
    terminologia: {
      version: () => 'v-test',
      entradas: (tipo, estandar) =>
        estandar === 'loinc'
          ? (LOINC[tipo] ?? []).map((termino): EntradaDeCodigo => ({
              terminoCanonico: termino,
              estandar: 'loinc',
              codigo: `C-${termino}`,
              nombreOficial: termino,
              etiquetaEs: `Etiqueta ${termino}`,
            }))
          : [],
      sinonimos: () => [],
    },
    datosCriticos: {
      version: () => 'v-test',
      deTipo: (tipo): DatosCriticosDeUnTipo | undefined =>
        ITEMS[tipo] === undefined
          ? undefined
          : { items: ITEMS[tipo], verifiedReviewStatuses: ['verificado'] },
    },
    tiposDelCatalogo: ['mama', 'prostata', 'pulmon'],
    tiposHabilitados: { estaHabilitado: (tipo) => tipo !== 'pulmon' },
    ...sobrescribe,
  };
}

describe('opcionesDeRegistroManual', () => {
  it('ofrece solo los términos y el destino de ítems del tipo de cáncer dado', () => {
    const opciones = opcionesDeRegistroManual(fuente(), 'mama');

    expect(opciones.cancerType).toBe('mama');
    expect(opciones.catalogVersion).toBe('v-test');
    expect(opciones.biomarkerTerms.map((t) => t.term)).toEqual(['Ki-67', 'RE']);
    expect(opciones.criticalItems.map((i) => i.item)).toEqual(['grado', 'ki67', 'tratamientos']);
    expect(opciones.gradingSystems).toEqual(['nottingham']);
  });

  it('usa el nombre del ítem crítico como término y la etiqueta del ítem cuando el término está en el checklist y en el LOINC', () => {
    const { biomarkerTerms } = opcionesDeRegistroManual(fuente(), 'mama');

    expect(biomarkerTerms[0]).toEqual({ term: 'Ki-67', label: 'Ki-67' });
    expect(biomarkerTerms[1]).toEqual({ term: 'RE', label: 'Etiqueta RE' });
  });

  it('copia entity, field y term del destino y deja null lo que el destino no tiene', () => {
    const { criticalItems } = opcionesDeRegistroManual(fuente(), 'mama');

    expect(criticalItems).toEqual([
      { item: 'grado', entity: 'Diagnosis', field: 'grade', term: null },
      { item: 'ki67', entity: 'Biomarker', field: 'value', term: 'Ki-67' },
      { item: 'tratamientos', entity: 'PriorTreatment', field: null, term: null },
    ]);
  });

  it('abarca todos los tipos habilitados y deja cancerType en null cuando no hay diagnóstico vigente', () => {
    const opciones = opcionesDeRegistroManual(fuente(), null);

    expect(opciones.cancerType).toBeNull();
    expect(opciones.enabledCancerTypes).toEqual(['mama', 'prostata']);
    expect(opciones.gradingSystems).toEqual(['nottingham', 'gleason_isup']);
    expect(opciones.stagingSystems).toEqual(['TNM_8']);
    expect(opciones.biomarkerTerms.map((t) => t.term)).toEqual(['Ki-67', 'PSA', 'RE']);
  });

  it('no ofrece sistemas de estadificación ni de gradación cuando el tipo no los define', () => {
    const opciones = opcionesDeRegistroManual(fuente(), 'pulmon');

    expect(opciones.stagingSystems).toEqual([]);
    expect(opciones.gradingSystems).toEqual([]);
  });

  it('no repite un ítem crítico con la misma clave en dos tipos de cáncer', () => {
    const { criticalItems } = opcionesDeRegistroManual(fuente(), null);

    expect(criticalItems.filter((i) => i.item === 'grado')).toHaveLength(1);
  });

  it('expone las escalas funcionales con su rango como minimum y maximum', () => {
    const { performanceScales } = opcionesDeRegistroManual(fuente(), 'mama');

    expect(performanceScales).toEqual([{ code: 'ECOG', minimum: 0, maximum: 5 }]);
  });

  it('omite un sistema de gradación que el contrato no conoce', () => {
    const escalas = { ...fuente().escalas, sistemasDeGradacion: () => ['nottingham', 'otro'] };

    const { gradingSystems } = opcionesDeRegistroManual(fuente({ escalas }), 'mama');

    expect(gradingSystems).toEqual(['nottingham']);
  });

  it('devuelve listas vacías cuando el tipo de cáncer no tiene datos en el catálogo', () => {
    const opciones = opcionesDeRegistroManual(fuente(), 'pulmon');

    expect(opciones.criticalItems).toEqual([]);
    expect(opciones.biomarkerTerms).toEqual([]);
  });
});
