import { mensajes } from '../../lib/mensajes';

/** Aviso que no bloquea tras guardar una corrección (RN-26): un análisis ya hecho conserva el valor previo. */
export function AvisoAnalisisAnteriores() {
  return (
    <p
      role="status"
      className="rounded-control border-warn-border bg-warn-bg text-warn m-0 mt-2 border p-3"
    >
      {mensajes().ficha.correccion.avisoAnalisisAnteriores}
    </p>
  );
}
