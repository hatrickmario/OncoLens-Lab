'use client';

import type { ReactNode } from 'react';
import type { TextosDePacientes } from '../../lib/pacientes/consulta';

export interface BusquedaDePacientesProps {
  textos: TextosDePacientes;
  /** El listado (RSC); se oculta mientras hay resultados de una búsqueda. */
  children: ReactNode;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- esqueleto del rojo
export function BusquedaDePacientes(_props: BusquedaDePacientesProps): ReactNode {
  throw new Error('no implementado');
}
