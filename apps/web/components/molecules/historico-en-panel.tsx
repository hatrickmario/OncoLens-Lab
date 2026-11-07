'use client';

import { useEffect, useState } from 'react';
import {
  pedirHistoricoDeTramo,
  type DatoCorregible,
  type ResultadoDeHistorico,
} from '../../lib/correcciones/cliente';
import { ContenidoDelHistorico } from './historico-del-dato';

export interface HistoricoEnPanelProps {
  patientId: string;
  /** Tramo `…/history` que derivó `rutaDeHistorico`; solo se monta si el recurso lo tiene. */
  tramo: string;
  dato: DatoCorregible;
}

/** Pide al BFF las versiones reemplazadas de un dato (ADR-50) al abrirse el panel y las lista con `ContenidoDelHistorico`. */
export function HistoricoEnPanel({ patientId, tramo, dato }: HistoricoEnPanelProps) {
  const [estado, setEstado] = useState<ResultadoDeHistorico | null>(null);
  useEffect(() => {
    let vigente = true;
    void pedirHistoricoDeTramo(patientId, tramo).then((nuevo) => vigente && setEstado(nuevo));
    return () => {
      vigente = false;
    };
  }, [patientId, tramo]);
  return <ContenidoDelHistorico estado={estado ?? 'cargando'} dato={dato} />;
}
