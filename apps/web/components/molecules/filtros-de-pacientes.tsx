import type { ReactNode } from 'react';
import type { FiltrosDelListado, TextosDePacientes } from '../../lib/pacientes/consulta';

export interface FiltrosDePacientesProps {
  filtros: FiltrosDelListado;
  textos: TextosDePacientes;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- esqueleto del rojo
export function FiltrosDePacientes(_props: FiltrosDePacientesProps): ReactNode {
  throw new Error('no implementado');
}
