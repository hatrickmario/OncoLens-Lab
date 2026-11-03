'use client';

import Link from 'next/link';
import type { CaseView } from '../../../../packages/api-contracts/src/types/clinical-api';
import { separarSinFecha } from '../../lib/caso/presentacion';
import { useVistaDeCaso } from '../../lib/caso/use-vista-de-caso';
import { mensajes } from '../../lib/mensajes';
import { Alert } from '../ui/alert';
import { VistaDeCasoNoDisponible } from '../molecules/vista-de-caso-no-disponible';
import { BiomarkerSeriesTables } from './biomarker-series-tables';
import { CaseTimeline } from './case-timeline';
import { ClinicalAttributesTable } from './clinical-attributes-table';
import { PriorTreatmentsTable } from './prior-treatments-table';
import { UndatedEvents } from './undated-events';

function SeccionesDelCaso({ vista, hoy }: { vista: CaseView; hoy: string }) {
  const { fechados, sinFecha } = separarSinFecha(vista.timeline);
  return (
    <>
      <CaseTimeline eventos={fechados} hoy={hoy} />
      {sinFecha.length > 0 && <UndatedEvents eventos={sinFecha} />}
      <PriorTreatmentsTable tratamientos={vista.priorTreatments} hoy={hoy} />
      <ClinicalAttributesTable atributos={vista.attributes} hoy={hoy} />
      <BiomarkerSeriesTables series={vista.biomarkerSeries} hoy={hoy} />
    </>
  );
}

/**
 * Vista de caso del paciente (US-090, D10): lee `GET /api/patients/{id}/case` y muestra solo lo ya validado. Único
 * componente cliente de la página; sin datos parciales si la lectura falla. Los avisos no bloquean (RN-26).
 */
export function VistaDeCaso({ patientId, hoy }: { patientId: string; hoy: string }) {
  const { lectura, recargar } = useVistaDeCaso(patientId);
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
  return <SeccionesDelCaso vista={lectura.vista} hoy={hoy} />;
}
