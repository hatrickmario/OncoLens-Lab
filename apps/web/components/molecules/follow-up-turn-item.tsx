import type {
  AnalysisBasis,
  CitedSource,
  FollowUpTurn,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { baseDeLaRespuesta } from '../../lib/evidence/seguimiento/base-de-la-respuesta';
import { mensajes, rellenar } from '../../lib/mensajes';
import estilos from '../evidence.module.css';
import { AiDisclaimer } from './ai-disclaimer';
import { FollowUpClaims } from './follow-up-claims';
import { FollowUpStateNotice } from './follow-up-state-notice';

export interface FollowUpTurnItemProps {
  turno: FollowUpTurn;
  /** Base del análisis de origen: el turno no trae una propia. */
  base: AnalysisBasis;
  onVerFragmento: (cita: CitedSource, idChip: string) => void;
  onNuevoAnalisis: () => void;
}

/** Un turno: pregunta enmascarada, respuesta citada o estado, y el aviso de IA con la etiqueta académica (RN-19). */
export function FollowUpTurnItem({ turno, base, onVerFragmento, onNuevoAnalisis }: FollowUpTurnItemProps) {
  const { followUp, app } = mensajes();
  const idTitulo = `seguimiento-turno-${turno.turnNumber}`;
  const textoDeEstado =
    turno.status === 'sin_evidencia' ? followUp.sinEvidencia : followUp.fueraDeContexto;
  return (
    <article className={estilos.tarjeta} aria-labelledby={idTitulo}>
      <h5 id={idTitulo}>
        {rellenar(followUp.turno, { n: turno.turnNumber })} · {turno.question}
      </h5>
      {turno.status === 'con_evidencia' ? (
        <>
          <FollowUpClaims turno={turno} onVerFragmento={onVerFragmento} />
          {turno.omittedClaims > 0 && (
            <p>{rellenar(followUp.omitidas, { n: turno.omittedClaims })}</p>
          )}
          <p>{followUp.notaCitas}</p>
          <p>{baseDeLaRespuesta(base)}</p>
        </>
      ) : (
        <FollowUpStateNotice texto={textoDeEstado} onNuevoAnalisis={onNuevoAnalisis} />
      )}
      <AiDisclaimer text={turno.disclaimer} />
      <p>{app.academicUseLabel}</p>
    </article>
  );
}
