import { formatearFecha } from '../../lib/ficha/presentacion';
import { mensajes, rellenar } from '../../lib/mensajes';

/** Aviso de la declaración vigente: dice cuándo se declaró (si hay fecha) y que un tratamiento nuevo la reemplaza. */
export function AvisoDeDeclaracionVigente({ observedAt }: { observedAt: string | null }) {
  const { declaracion: d } = mensajes().caso.registro.tratamiento;
  return (
    <div role="note" className="m-0 mb-3">
      <p className="m-0">
        {observedAt === null
          ? d.declaradoSinFecha
          : rellenar(d.declaradoEl, { fecha: formatearFecha(observedAt) })}
      </p>
      <p className="m-0 font-semibold">{d.reemplazo}</p>
    </div>
  );
}
