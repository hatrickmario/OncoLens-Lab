import type { ClinicalNote } from '../../../../packages/api-contracts/src/types/clinical-api';

export interface NotasClinicasDeFichaProps {
  /** `null` cuando la lectura falló: la ficha se muestra igual (RN-26). */
  notas: ClinicalNote[] | null;
  pacienteId: string;
  egresado: boolean;
}

export function NotasClinicasDeFicha(_props: NotasClinicasDeFichaProps): never {
  throw new Error('no implementado');
}
