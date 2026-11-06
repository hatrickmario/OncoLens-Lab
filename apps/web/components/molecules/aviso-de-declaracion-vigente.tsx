import { formatearFecha } from '../../lib/ficha/presentacion';
import { mensajes, rellenar } from '../../lib/mensajes';

/** Aviso de la declaración vigente: dice cuándo se declaró y que un tratamiento nuevo la reemplaza. */
export function AvisoDeDeclaracionVigente({ fecha }: { fecha: string }) {
  const { declaracion: d } = mensajes().caso.registro.tratamiento;
  return (
    <div role="note" className="m-0 mb-3">
      <p className="m-0">{rellenar(d.declaradoEl, { fecha: formatearFecha(fecha) })}</p>
      <p className="m-0 font-semibold">{d.reemplazo}</p>
    </div>
  );
}
