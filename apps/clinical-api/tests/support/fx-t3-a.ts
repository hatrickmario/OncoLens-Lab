import {
  nuevoPaciente,
  sembrarBiomarcador,
  sembrarDiagnostico,
  type ContextoDeSiembra,
  type PacienteSembrado,
} from './completitud.js';

/**
 * FX-T3-a (FEAT-T3, US-071): paciente SINTÉTICO de mama con HER2 `3+` `verificado`, Ki-67 `20 %` `requiere_revision`,
 * dos receptores de estrógeno en conflicto (`conflicts_with_id`) y sin `estado_menopausico` (dato crítico faltante del
 * catálogo `test-1.0.0`). Acumula todos los avisos clínicos del S5 en un solo caso para probar que ninguno bloquea
 * (RN-26). Todo es sintético (`data_origin = sintetico`, RN-13, RN-14).
 */

/** Los avisos que FX-T3-a acumula, por el nombre que cada lectura les da. */
export const CLAVE_DEL_FALTANTE = 'estado_menopausico';
export const CLAVE_DEL_DATO_SIN_VERIFICAR = 'ki67';

export interface FxT3aSembrado extends PacienteSembrado {
  readonly filas: {
    readonly her2: string;
    readonly ki67: string;
    readonly receptorEstrogenoBase: string;
    readonly receptorEstrogenoEnConflicto: string;
  };
}

export async function sembrarFxT3a(contexto: ContextoDeSiembra): Promise<FxT3aSembrado> {
  const p = await nuevoPaciente(contexto);
  await sembrarDiagnostico(p, {
    cancerType: 'mama',
    histology: 'carcinoma ductal infiltrante',
    grade: '2',
    stagingSystem: 'TNM_8',
    stageValue: 'IIA',
    performanceValue: 1,
  });
  const her2 = await sembrarBiomarcador(p, {
    name: 'HER2',
    value: '3+ (IHQ)',
    reviewStatus: 'verificado',
  });
  const ki67 = await sembrarBiomarcador(p, {
    name: 'Ki-67',
    value: '20 %',
    reviewStatus: 'requiere_revision',
    entryMethod: 'ocr',
    extractionConfidence: 'media',
  });
  const receptorEstrogenoBase = await sembrarBiomarcador(p, {
    name: 'Receptor de estrógeno',
    value: 'Positivo',
    reviewStatus: 'verificado',
  });
  const receptorEstrogenoEnConflicto = await sembrarBiomarcador(p, {
    name: 'Receptor de estrógeno',
    value: 'Negativo',
    reviewStatus: 'requiere_revision',
    entryMethod: 'ocr',
    extractionConfidence: 'media',
    enConflictoCon: receptorEstrogenoBase,
  });
  return {
    ...p,
    filas: { her2, ki67, receptorEstrogenoBase, receptorEstrogenoEnConflicto },
  };
}
