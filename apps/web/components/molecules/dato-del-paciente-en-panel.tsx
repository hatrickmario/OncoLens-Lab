'use client';

import type { ConversationDataLink } from '../../../../packages/api-contracts/src/types/clinical-api';
import { datoConHistorico, rutaDeHistorico } from '../../lib/caso/ruta-de-historico';
import { useVistaDeCaso } from '../../lib/caso/use-vista-de-caso';
import { datoDelCaso } from '../../lib/conversacion/dato-del-panel';
import { hrefDeVistaDeCaso } from '../../lib/ficha/anclas';
import { formatearFecha, nombreDeOrigen } from '../../lib/ficha/presentacion';
import { mensajes } from '../../lib/mensajes';
import { MarkdownSeguro } from '../atoms/markdown-seguro';
import { HistoricoEnPanel } from './historico-en-panel';
import { ProcedenciaDelDato } from './procedencia-del-dato';

export interface DatoDelPacienteEnPanelProps {
  patientId: string;
  enlace: ConversationDataLink;
  /** Lo que el turno dice de este dato: se muestra cuando la vista de caso no trae su valor (RN-01). */
  textosDelTurno: readonly string[];
}

/**
 * Dato del paciente en el panel lateral, leído bajo demanda por `/api/patients/{id}/case` y, si tiene histórico, por su
 * `…/history`. Un fallo es «No se pudo cargar el dato» con «Reintentar», sin detalle técnico y sin tocar el hilo.
 */
export function DatoDelPacienteEnPanel({
  patientId,
  enlace,
  textosDelTurno,
}: DatoDelPacienteEnPanelProps) {
  const { panel, datos, reintentar } = mensajes().conversacion;
  const { lectura, recargar } = useVistaDeCaso(patientId);
  const dato = lectura?.tipo === 'ok' ? datoDelCaso(lectura.vista, enlace) : null;
  const tramo = rutaDeHistorico(enlace.resourceType, enlace.resourceId);
  const tipoConHistorico = datoConHistorico(enlace.resourceType);
  return (
    <div>
      <h3 className="m-0">
        {datos[enlace.resourceType]}
        {enlace.recordedDate && ` · ${formatearFecha(enlace.recordedDate)}`}
      </h3>
      <p className="m-0 mt-1">
        {panel.origen}:{' '}
        {dato ? (
          <ProcedenciaDelDato procedencia={dato.procedencia} />
        ) : (
          nombreDeOrigen(enlace.origin)
        )}
      </p>
      {lectura === null && <p>{panel.cargando}</p>}
      {lectura !== null && lectura.tipo !== 'ok' && (
        <div role="alert">
          <p>{panel.errorDato}</p>
          <button
            type="button"
            onClick={() => void recargar()}
            className="border-control-border rounded-control bg-surface min-h-11 cursor-pointer border px-4"
          >
            {reintentar}
          </button>
        </div>
      )}
      {lectura?.tipo === 'ok' &&
        (dato ? (
          <p>{dato.valor}</p>
        ) : (
          <section aria-label={panel.enLaRespuesta}>
            <p className="text-text-muted m-0 text-sm">{panel.enLaRespuesta}</p>
            {textosDelTurno.map((texto) => (
              <MarkdownSeguro key={texto} texto={texto} />
            ))}
          </section>
        ))}
      {lectura?.tipo === 'ok' && tramo !== null && tipoConHistorico !== null && (
        <div className="mt-2">
          <HistoricoEnPanel patientId={patientId} tramo={tramo} dato={tipoConHistorico} />
        </div>
      )}
      <a
        href={hrefDeVistaDeCaso(patientId)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block min-h-11 py-2 underline"
      >
        {panel.abrirCasoCompleto}
      </a>
    </div>
  );
}
