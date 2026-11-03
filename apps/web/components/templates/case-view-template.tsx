import Link from 'next/link';
import type { ReactNode } from 'react';
import { mensajes } from '../../lib/mensajes';

/**
 * Layout de la vista de caso (S5-05, pantalla 07 del flujo E2E): columna «Datos críticos» opcional (la llena `l1d-96`,
 * S5-02) y columna principal con la acción de analizar. Es servidor: solo compone, no lee datos.
 */
export function CaseViewTemplate({
  patientId,
  datosCriticos,
  children,
}: {
  patientId: string;
  datosCriticos?: ReactNode;
  children: ReactNode;
}) {
  const { caso } = mensajes();
  return (
    <div className={datosCriticos ? 'grid gap-4 lg:grid-cols-[18rem_1fr]' : ''}>
      {datosCriticos && <aside>{datosCriticos}</aside>}
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
    </div>
  );
}
