import type { EventoDelCaso } from '../../lib/caso/presentacion';
import { mensajes } from '../../lib/mensajes';
import { SeccionDeFicha } from '../molecules/fila-de-ficha';
import { EventoDelCasoItem } from './case-timeline';

/** «Sin fecha confiable» (AC-02.2): eventos con fecha incierta, aparte del orden cronológico y sin fecha inventada. */
export function UndatedEvents({ eventos }: { eventos: EventoDelCaso[] }) {
  const { secciones, notaSinFecha } = mensajes().caso;
  return (
    <SeccionDeFicha id="caso-sin-fecha" titulo={secciones.sinFecha}>
      <p className="text-text-muted m-0 mb-2 text-sm">{notaSinFecha}</p>
      <ul className="m-0 list-none p-0">
        {eventos.map((e) => (
          <EventoDelCasoItem key={e.id} evento={e} hoy={null} />
        ))}
      </ul>
    </SeccionDeFicha>
  );
}
