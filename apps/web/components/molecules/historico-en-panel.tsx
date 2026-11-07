'use client';

import { useEffect, useState } from 'react';
import {
  pedirHistoricoDeTramo,
  type DatoCorregible,
  type ResultadoDeHistorico,
} from '../../lib/correcciones/cliente';
import { formatearFecha, nombreDeOrigen } from '../../lib/ficha/presentacion';
import { mensajes } from '../../lib/mensajes';
import { textoDeLaVersion } from './historico-del-dato';

export interface HistoricoEnPanelProps {
  patientId: string;
  /** Tramo `…/history` que derivó `rutaDeHistorico`; solo se monta si el recurso lo tiene. */
  tramo: string;
  dato: DatoCorregible;
}

/** Versiones reemplazadas de un dato (ADR-50), pedidas al BFF al abrirse el panel y listadas en texto (RN-08). */
export function HistoricoEnPanel({ patientId, tramo, dato }: HistoricoEnPanelProps) {
  const { historico } = mensajes().ficha.correccion;
  const [estado, setEstado] = useState<ResultadoDeHistorico | null>(null);
  useEffect(() => {
    let vigente = true;
    void pedirHistoricoDeTramo(patientId, tramo).then((nuevo) => vigente && setEstado(nuevo));
    return () => {
      vigente = false;
    };
  }, [patientId, tramo]);
  if (estado === null) return <p className="m-0">{historico.cargando}</p>;
  if (estado.tipo === 'error') return <p className="m-0">{historico.error}</p>;
  if (estado.versiones.length === 0) return <p className="m-0">{historico.vacio}</p>;
  return (
    <ul aria-label={historico.etiqueta} className="m-0 list-none p-0">
      {estado.versiones.map((version) => (
        <li key={version.id} className="border-border flex flex-wrap gap-x-2 border-b py-1">
          <span className="whitespace-pre-wrap">{textoDeLaVersion(version, dato)}</span>
          <time dateTime={version.recordedAt.slice(0, 10)}>
            {formatearFecha(version.recordedAt)}
          </time>
          <span>{nombreDeOrigen(version.entryMethod)}</span>
          <span className="text-text-muted">{historico.reemplazado}</span>
        </li>
      ))}
    </ul>
  );
}
