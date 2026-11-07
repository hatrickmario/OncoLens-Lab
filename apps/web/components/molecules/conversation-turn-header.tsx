import type { ConversationTurn } from '../../../../packages/api-contracts/src/types/clinical-api';
import { formatearFechaIso } from '../../lib/evidence/formatear-fecha';
import { mensajes, rellenar } from '../../lib/mensajes';

/** Cabecera del turno: número, fecha y chip de intención (símbolo + texto, «Intención detectada» como nombre accesible). */
export function ConversationTurnHeader({
  turno,
}: {
  turno: Pick<ConversationTurn, 'turnNumber' | 'createdAt' | 'intent'>;
}) {
  const { turno: textoTurno, intencionDetectada, intenciones } = mensajes().conversacion;
  const intencion = Object.hasOwn(intenciones, turno.intent)
    ? intenciones[turno.intent]
    : intenciones.no_clasificada;
  return (
    <header className="flex flex-wrap items-center gap-2">
      <strong>{rellenar(textoTurno, { n: turno.turnNumber })}</strong>
      <time dateTime={turno.createdAt} className="text-text-muted text-sm">
        {formatearFechaIso(turno.createdAt)}
      </time>
      <span
        title={intencionDetectada}
        className="border-control-border rounded-etiqueta border px-2 text-sm"
      >
        <span className="sr-only">{intencionDetectada}: </span>
        {intencion}
      </span>
    </header>
  );
}
