import type { AnalysisBasis } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../mensajes';

export interface ResumenDeBase {
  faltantes: number;
  supuestos: number;
  /** Nombres separados por coma, o "ninguna"; solo se nombra la exclusión, nunca su contenido (RN-21). */
  fuentesNoIncluidas: string;
  omitidas: number;
  /** Texto de los supuestos de origen `regla_catalogo`, para que "Faltantes: 0" no se lea como "nada falta". */
  supuestosDeReglaCatalogo: string[];
}

export function resumirBase(base: AnalysisBasis): ResumenDeBase {
  const { ninguna } = mensajes().evidence.base;
  return {
    faltantes: base.missingCriticalData.length,
    supuestos: base.assumptions.length,
    fuentesNoIncluidas: base.sourcesNotIncluded.join(', ') || ninguna,
    omitidas: base.omittedClaims,
    supuestosDeReglaCatalogo: base.assumptions
      .filter((supuesto) => supuesto.origin === 'regla_catalogo')
      .map((supuesto) => supuesto.text),
  };
}

export function textoDeFaltantes(_resumen: ResumenDeBase): string {
  throw new Error('no implementado');
}

/** `AAAA-MM-DD` → `dd/mm/aaaa` partiendo la cadena: `new Date()` desplazaría un día según la zona horaria. */
export function formatearFechaDeCorte(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}
