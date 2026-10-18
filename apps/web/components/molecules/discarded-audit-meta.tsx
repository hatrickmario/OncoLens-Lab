import { mensajes, rellenar } from '../../lib/mensajes';

export interface DiscardedAuditMetaProps {
  /** Posición en `discardedOptions`, desde 1. */
  numero: number;
  idAnalisis: string;
  /** ISO 8601 tal cual llega en la respuesta. */
  creadoEn: string;
}

/** Auditoría mínima de una descartada (`[S1 resp. 29]`): n.º, id del análisis y fecha; nada más de la traza. */
export function DiscardedAuditMeta({ numero, idAnalisis, creadoEn }: DiscardedAuditMetaProps) {
  const { discarded } = mensajes().evidence;
  return (
    <p data-testid="discarded-audit-meta">
      {rellenar(discarded.numero, { n: numero })} · {discarded.analisis} {idAnalisis} · {creadoEn}
    </p>
  );
}
