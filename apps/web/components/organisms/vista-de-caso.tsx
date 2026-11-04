'use client';

import Link from 'next/link';
import { useVistaDeCaso } from '../../lib/caso/use-vista-de-caso';
import { useChecklistDeFaltantes } from '../../lib/evidence/use-checklist-de-faltantes';
import { mensajes } from '../../lib/mensajes';
import { Alert } from '../ui/alert';
import { VistaDeCasoNoDisponible } from '../molecules/vista-de-caso-no-disponible';
import { SeccionesDelCaso } from './secciones-del-caso';

/**
 * Vista de caso del paciente (US-090, D10): lee `GET /api/patients/{id}/case` y muestra solo lo ya validado. Único
 * componente cliente de la página; sin datos parciales si la lectura falla. Los avisos no bloquean (RN-26).
 */
export function VistaDeCaso({
  patientId,
  hoy,
  egresado = false,
  item,
}: {
  patientId: string;
  hoy: string;
  /** Paciente egresado (RN-17): los registros manuales se deshabilitan. */
  egresado?: boolean;
  /** Clave del catálogo de `?item=` (US-111): abre el formulario de su entidad. */
  item?: string;
}) {
  const { lectura, recargar } = useVistaDeCaso(patientId);
  const { lectura: checklist, releer } = useChecklistDeFaltantes(patientId);
  const { caso, ficha } = mensajes();
  if (lectura === null || lectura.tipo === 'sin_sesion') {
    return (
      <p role="status" aria-busy="true" className="text-text-muted m-0">
        {caso.cargando}
      </p>
    );
  }
  if (lectura.tipo === 'error') return <VistaDeCasoNoDisponible onReintentar={recargar} />;
  if (lectura.tipo === 'sin_permiso') return <Alert>{caso.sinPermiso}</Alert>;
  if (lectura.tipo === 'no_encontrado') {
    return (
      <>
        <h2 className="m-0 mb-3 text-2xl font-semibold">{ficha.noEncontrado.titulo}</h2>
        <Link href="/pacientes" className="text-primary font-semibold">
          {ficha.noEncontrado.volver}
        </Link>
      </>
    );
  }
  return (
    <SeccionesDelCaso
      vista={lectura.vista}
      hoy={hoy}
      patientId={patientId}
      egresado={egresado}
      checklist={checklist}
      alRegistrar={() => void Promise.all([recargar(), releer()])}
      item={item}
    />
  );
}
