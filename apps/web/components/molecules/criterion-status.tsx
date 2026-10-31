import type { ApplicabilityCriterion } from '../../../../packages/api-contracts/src/types/clinical-api';
import { presentacionDelEstado } from '../../lib/evidence/estados-de-aplicabilidad';
import { enlaceDeFichaParaCriterio, rotuloDeCriterio } from '../../lib/evidence/presentar-criterio';
import { mensajes } from '../../lib/mensajes';
import estilos from '../evidence.module.css';
import { EnlaceDeRegistro } from './enlace-de-registro';

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
  const { simbolo, clave } = presentacionDelEstado(criterio.status);
  const texto = mensajes().evidence.aplicabilidad[clave];
  const faltaEnPaciente = criterio.unknownReason === 'falta_en_paciente';
  return (
    <>
      <span className={estilos[clave]}>
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
