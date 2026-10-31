import type {
  ApplicabilityCriterion,
  CitedSource,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { motivoDelEstado } from '../../lib/evidence/motivo-del-estado';
import { presentarValor } from '../../lib/evidence/presentar-valor';
import { rotuloDeCriterio } from '../../lib/evidence/presentar-criterio';
import { valoresDelEstudio } from '../../lib/evidence/valores-del-estudio';
import { mensajes } from '../../lib/mensajes';
import estilos from '../evidence.module.css';
import { CriterionStatus } from './criterion-status';
import { StudyValueList } from './study-value-list';

export interface ApplicabilityCriterionRowProps {
  criterio: ApplicabilityCriterion;
  /** Citas de la tarjeta de la opción: su posición numera los fragmentos (D8). */
  citas: readonly CitedSource[];
  patientId: string;
}

/** Fila de la tabla: criterio, valor del paciente, valores del estudio y estado. La UI no recalcula nada. */
export function ApplicabilityCriterionRow({
  criterio,
  citas,
  patientId,
}: ApplicabilityCriterionRowProps) {
  const { columnas, sinDato, datoSinVerificar, excluyente } = mensajes().evidence.aplicabilidad;
  const valores = valoresDelEstudio(
    criterio,
    citas.map((c) => c.chunkId),
  );
  const enConflicto = criterio.unknownReason === 'valores_en_conflicto';
  const presentar = (conAlcance: boolean) => (valor: (typeof valores.elegibilidad)[number]) =>
    presentarValor(valor, citas, { conDatosDelFragmento: enConflicto, conAlcance });
  return (
    <tr>
      <th scope="row" data-etiqueta={columnas.criterio}>
        {rotuloDeCriterio(criterio.criterion)}
        {criterio.isExclusionary && (
          <>
            {' '}
            <span role="img" aria-label={excluyente}>
              ⚑
            </span>
          </>
        )}
      </th>
      <td data-etiqueta={columnas.paciente}>
        <span>{criterio.patientValue ?? sinDato}</span>
        {criterio.patientDataWarning === 'sin_verificar' && (
          <>
            {' '}
            <span className={estilos.avisoDeDato}>{datoSinVerificar}</span>
          </>
        )}
      </td>
      <td data-etiqueta={columnas.estudio}>
        <StudyValueList
          valores={valores.elegibilidad.map(presentar(false))}
          contexto={valores.contexto.map(presentar(true))}
        />
      </td>
      <td data-etiqueta={columnas.estado}>
        <CriterionStatus
          criterio={criterio}
          motivo={motivoDelEstado(criterio, valores)}
          patientId={patientId}
        />
      </td>
    </tr>
  );
}
