import { esEventoDeIa, rotuloDeEvento, type EventoDelCaso } from '../../lib/caso/presentacion';
import { mensajes } from '../../lib/mensajes';
import { FechaRelativa } from '../atoms/fecha-relativa';
import { SeccionDeFicha } from '../molecules/fila-de-ficha';
import { ProcedenciaDelEvento } from '../molecules/procedencia-del-evento';

/** Evento de la línea de tiempo: tipo, fecha, descripción, procedencia. `hoy = null` (sin fecha confiable) no pinta fecha. */
export function EventoDelCasoItem({ evento, hoy }: { evento: EventoDelCaso; hoy: string | null }) {
  return (
    <li className="border-border border-b py-2 last:border-b-0">
      <p className="m-0">
        <span className="font-semibold">{rotuloDeEvento(evento.eventType)}</span>
        {evento.eventDate !== null && hoy !== null && (
          <>
            {' · '}
            <FechaRelativa fecha={evento.eventDate} hoy={hoy} />
          </>
        )}
      </p>
      <p className="m-0">{evento.description}</p>
      {esEventoDeIa(evento.eventType) && (
        <p className="text-text-muted m-0 text-sm italic">{mensajes().caso.textoGeneradoPorIa}</p>
      )}
      <ProcedenciaDelEvento evento={evento} />
    </li>
  );
}

/** Línea de tiempo de los eventos fechados, en el orden del servidor (D6). */
export function CaseTimeline({ eventos, hoy }: { eventos: EventoDelCaso[]; hoy: string }) {
  const { secciones, sinDatos } = mensajes().caso;
  return (
    <SeccionDeFicha id="caso-linea-de-tiempo" titulo={secciones.lineaDeTiempo}>
      {eventos.length === 0 ? (
        <p className="m-0">{sinDatos}</p>
      ) : (
        <ol className="m-0 list-none p-0">
          {eventos.map((e) => (
            <EventoDelCasoItem key={e.id} evento={e} hoy={hoy} />
          ))}
        </ol>
      )}
    </SeccionDeFicha>
  );
}
