import { esEventoDeIa, type EventoDelCaso } from '../../lib/caso/presentacion';
import { mensajes } from '../../lib/mensajes';
import { ProcedenciaDelDato } from './procedencia-del-dato';

/**
 * Procedencia de un evento de la línea de tiempo. Un evento de IA lleva solo «Generado por IA · Sin verificar», sin
 * confianza de extracción ni «Registro manual» aunque su `entryMethod` técnico sea `manual` (D9, RN-19, RN-24).
 * La decisión vive aquí: el llamador no puede olvidarla.
 */
export function ProcedenciaDelEvento({ evento }: { evento: EventoDelCaso }) {
  if (esEventoDeIa(evento.eventType)) {
    return <span className="text-text-muted text-sm">{mensajes().caso.origenIa}</span>;
  }
  return <ProcedenciaDelDato procedencia={evento.provenance} />;
}
