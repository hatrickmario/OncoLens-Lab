import Link from 'next/link';
import { mensajes, rellenar } from '../../lib/mensajes';
import { Alert } from '../ui/alert';

/** Estado de la ficha cuando no hay paciente que mostrar: no encontrado o error con su traceId (lo comparten ficha y caso). */
export function FichaNoDisponible({
  resultado,
}: {
  resultado: { tipo: 'no_encontrada' } | { tipo: 'error'; traceId?: string };
}) {
  const { ficha } = mensajes();
  if (resultado.tipo === 'no_encontrada') {
    return (
      <>
        <h1 className="m-0 mb-3 text-2xl font-semibold">{ficha.noEncontrado.titulo}</h1>
        <Link href="/pacientes" className="text-primary font-semibold">
          {ficha.noEncontrado.volver}
        </Link>
      </>
    );
  }
  return (
    <Alert>
      {resultado.traceId === undefined
        ? ficha.errorSinTraza
        : rellenar(ficha.error, { traceId: resultado.traceId })}
    </Alert>
  );
}
