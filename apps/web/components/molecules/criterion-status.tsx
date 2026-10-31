import type { ApplicabilityCriterion } from '../../../../packages/api-contracts/src/types/clinical-api';
import { enlaceDeFichaParaCriterio, rotuloDeCriterio } from '../../lib/evidence/presentar-criterio';
import { mensajes } from '../../lib/mensajes';
import estilos from '../evidence.module.css';
import { EnlaceDeRegistro } from './enlace-de-registro';

type Estado = ApplicabilityCriterion['status'];

/** Símbolo, palabra y clase por estado: el estado se distingue por texto, nunca solo por color (NFR-12, WCAG 1.4.1). */
const ESTADOS = {
  coincide: { simbolo: '✓', palabra: 'coincide', clase: 'coincide' },
  parcial: { simbolo: '◐', palabra: 'parcial', clase: 'parcial' },
  no_coincide: { simbolo: '✕', palabra: 'noCoincide', clase: 'noCoincide' },
  desconocido: { simbolo: '?', palabra: 'desconocido', clase: 'desconocido' },
} as const satisfies Record<Estado, { simbolo: string; palabra: string; clase: string }>;

export interface CriterionStatusProps {
  criterio: ApplicabilityCriterion;
  /** Motivo de Parcial o causa de Desconocido ya resueltos desde `es.json`. */
  motivo: string | null;
  patientId: string;
}

/**
 * Estado de un criterio: «◐ Parcial · motivo» o «? Desconocido · causa». Un Desconocido por dato ausente en
 * el paciente enlaza a la ficha (informa, no bloquea, RN-26).
 */
export function CriterionStatus({ criterio, motivo, patientId }: CriterionStatusProps) {
  const { simbolo, palabra, clase } = ESTADOS[criterio.status];
  const texto = mensajes().evidence.aplicabilidad[palabra];
  const faltaEnPaciente = criterio.unknownReason === 'falta_en_paciente';
  return (
    <>
      <span className={estilos[clase]}>
        <span aria-hidden="true">{simbolo} </span>
        {motivo ? `${texto} · ${motivo}` : texto}
      </span>
      {faltaEnPaciente && (
        <>
          {' '}
          <EnlaceDeRegistro
            etiqueta={rotuloDeCriterio(criterio.criterion)}
            href={enlaceDeFichaParaCriterio(patientId, criterio.criterion)}
          />
        </>
      )}
    </>
  );
}
