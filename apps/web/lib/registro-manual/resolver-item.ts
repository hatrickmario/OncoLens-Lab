import type { ManualEntryOptions } from '../../../../packages/api-contracts/src/types/clinical-api';

/** Campo del formulario de diagnóstico que recibe el foco; `gradacion` es el primer control de la gradación. */
export type CampoConFoco = 'histology' | 'stageValue' | 'gradacion' | 'performanceValue';

export type ItemResuelto =
  { entidad: 'Biomarker'; termino: string } | { entidad: 'Diagnosis'; campo: CampoConFoco };

/** Campo de destino del catálogo (`destination.field`) → control del formulario; el catálogo es el dueño del destino. */
const CAMPO_POR_DESTINO: Readonly<Record<string, CampoConFoco>> = {
  histology: 'histology',
  stage_value: 'stageValue',
  grade: 'gradacion',
  performance_value: 'performanceValue',
};

/**
 * Qué formulario abre la clave `?item=` según el destino que declara el catálogo (RN-29): `Biomarker` con su término,
 * `Diagnosis` con el foco en su campo. Clave desconocida, de otra entidad o sin destino reconocido → `null`: no se abre nada.
 */
export function resolverItem(
  catalogoDeRegistro: ManualEntryOptions,
  item: string,
): ItemResuelto | null {
  const critico = catalogoDeRegistro.criticalItems.find((c) => c.item === item);
  if (critico === undefined) return null;
  if (critico.entity === 'Biomarker') {
    return critico.term === null ? null : { entidad: 'Biomarker', termino: critico.term };
  }
  const campo = critico.entity === 'Diagnosis' ? CAMPO_POR_DESTINO[critico.field ?? ''] : undefined;
  return campo === undefined ? null : { entidad: 'Diagnosis', campo };
}
