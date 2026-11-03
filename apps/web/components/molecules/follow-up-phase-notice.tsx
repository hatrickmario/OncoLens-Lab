import type { FaseDelHilo } from '../../lib/evidence/seguimiento/fase-tras-seguimiento';
import { mensajes, rellenar } from '../../lib/mensajes';
import { AnalysisFailure } from './analysis-failure';
import { FollowUpStateNotice } from './follow-up-state-notice';

export interface FollowUpPhaseNoticeProps {
  fase: FaseDelHilo;
  maxFollowUps: number | undefined;
  onNuevoAnalisis: () => void;
  onReintentar: () => void;
}

/** Lo que el hilo dice fuera de los turnos: progreso sin contenido (TBD-08), límite alcanzado o fallo del servicio. */
export function FollowUpPhaseNotice(props: FollowUpPhaseNoticeProps) {
  const { fase, maxFollowUps, onNuevoAnalisis, onReintentar } = props;
  const { followUp } = mensajes();
  if (fase.tipo === 'enviando') {
    return (
      <div role="status">
        <p>{followUp.progresoBuscando}</p>
        <p>{followUp.progresoValidando}</p>
      </div>
    );
  }
  if (fase.tipo === 'limite_alcanzado') {
    const texto =
      maxFollowUps === undefined
        ? followUp.limiteSinTotal
        : rellenar(followUp.limiteConTotal, { max: maxFollowUps });
    return <FollowUpStateNotice texto={texto} onNuevoAnalisis={onNuevoAnalisis} />;
  }
  if (fase.tipo === 'error' || fase.tipo === 'red' || fase.tipo === 'limite') {
    return <AnalysisFailure fallo={fase} onReintentar={onReintentar} />;
  }
  return null;
}
