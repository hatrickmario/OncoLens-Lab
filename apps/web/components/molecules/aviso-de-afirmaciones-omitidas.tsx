import { mensajes, rellenar } from '../../lib/mensajes';

/**
 * Aviso de lo que el turno dejó fuera por falta de soporte (RN-01): aviso, no bloqueo (RN-26). Con 0 no se pinta.
 */
export function AvisoDeAfirmacionesOmitidas({ cantidad }: { cantidad: number }) {
  if (cantidad <= 0) return null;
  const { omitidas, omitidaUna } = mensajes().conversacion;
  return (
    <p
      role="note"
      className="bg-warn-bg border-warn-border text-warn rounded-tarjeta m-0 mt-2 border p-2 text-sm"
    >
      {cantidad === 1 ? omitidaUna : rellenar(omitidas, { n: cantidad })}
    </p>
  );
}
