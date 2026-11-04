import Link from 'next/link';
import type { ReactNode } from 'react';
import { mensajes } from '../../lib/mensajes';

/**
 * Layout de la vista de caso (S5-05, pantalla 07 del flujo E2E): título y acción de analizar sobre las secciones del caso.
 * La columna «Datos críticos» (S5-02) la monta `SeccionesDelCaso`, que comparte la relectura con la vista. Es servidor:
 * solo compone, no lee datos.
 */
export function CaseViewTemplate({
  patientId,
  children,
}: {
  patientId: string;
  children: ReactNode;
}) {
  const { caso } = mensajes();
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-xl font-semibold">{caso.titulo}</h2>
        <Link
          href={`/pacientes/${patientId}/analisis`}
          className="bg-primary rounded-control inline-flex min-h-11 items-center px-4 font-semibold text-white"
        >
          {caso.analizar}
        </Link>
      </div>
      {children}
    </div>
  );
}
