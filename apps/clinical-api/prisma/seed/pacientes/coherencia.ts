import type { PacienteSemilla } from './tipos.js';

export type ReglaDeHistoria =
  | 'linea_antes_del_diagnostico'
  | 'fin_antes_del_inicio'
  | 'solape_con_la_linea_siguiente'
  | 'hueco_en_la_numeracion'
  | 'evento_antes_del_diagnostico'
  | 'fecha_futura';

/** Un incumplimiento nombra la regla y la clave (del tratamiento, evento o diagnóstico) que la rompe. */
export interface IncoherenciaDeHistoria {
  readonly regla: ReglaDeHistoria;
  readonly clave: string;
}

export function historiaCoherente(_paciente: PacienteSemilla): readonly IncoherenciaDeHistoria[] {
  throw new Error('no implementado');
}
