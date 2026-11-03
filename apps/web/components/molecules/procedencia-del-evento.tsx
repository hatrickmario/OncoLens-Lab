import type { EventoDelCaso } from '../../lib/caso/presentacion';

/** Procedencia de un evento de la línea de tiempo: un evento de IA nunca se presenta como dato del paciente (RN-24). */
export function ProcedenciaDelEvento(_props: { evento: EventoDelCaso }): never {
  throw new Error('no implementado');
}
