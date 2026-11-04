import type { PacienteSemilla, TratamientoPreviaSemilla } from './tipos.js';

export type ReglaDeHistoria =
  | 'linea_antes_del_diagnostico'
  | 'fin_antes_del_inicio'
  | 'solape_con_la_linea_siguiente'
  | 'hueco_en_la_numeracion'
  | 'evento_antes_del_diagnostico'
  | 'fecha_futura';

/** Un incumplimiento nombra la regla y la clave (del tratamiento o del evento) que la rompe. */
export interface IncoherenciaDeHistoria {
  readonly regla: ReglaDeHistoria;
  readonly clave: string;
}

/**
 * Coherencia temporal de la historia de un paciente semilla (D3, US-254 AC-2). Las fechas son "días antes de la fecha de
 * referencia": más días = más antiguo, y un valor negativo cae en el futuro. Devuelve los incumplimientos (vacío si la
 * historia es coherente); el seed no la ejecuta, la usan los tests.
 */
export function historiaCoherente(paciente: PacienteSemilla): readonly IncoherenciaDeHistoria[] {
  const lineas = [...paciente.tratamientosPrevios].sort(
    (a, b) => b.diasDesdeElInicio - a.diasDesdeElInicio,
  );
  const diagnostico = Math.max(...paciente.diagnosticos.map((d) => d.diasDesdeElDiagnostico));
  return [
    ...incumplimientosDeCadaLinea(lineas, diagnostico),
    ...incumplimientosEntreLineas(lineas),
    ...incumplimientosDeLosEventos(paciente, diagnostico),
  ];
}

function incumplimientosDeCadaLinea(
  lineas: readonly TratamientoPreviaSemilla[],
  diagnostico: number,
): IncoherenciaDeHistoria[] {
  return lineas.flatMap((linea) => {
    const fin = linea.fin?.diasAntes;
    const incumplidas: IncoherenciaDeHistoria[] = [];
    if (linea.diasDesdeElInicio > diagnostico) {
      incumplidas.push({ regla: 'linea_antes_del_diagnostico', clave: linea.clave });
    }
    if (fin !== undefined && fin >= linea.diasDesdeElInicio) {
      incumplidas.push({ regla: 'fin_antes_del_inicio', clave: linea.clave });
    }
    if (linea.diasDesdeElInicio < 0 || (fin !== undefined && fin < 0)) {
      incumplidas.push({ regla: 'fecha_futura', clave: linea.clave });
    }
    return incumplidas;
  });
}

/** Líneas ya ordenadas por inicio: numeradas 1..n sin huecos y cada una empieza cuando la anterior terminó. */
function incumplimientosEntreLineas(
  lineas: readonly TratamientoPreviaSemilla[],
): IncoherenciaDeHistoria[] {
  return lineas.flatMap((linea, indice) => {
    const anterior = lineas[indice - 1];
    const incumplidas: IncoherenciaDeHistoria[] = [];
    if (linea.numeroDeLinea !== indice + 1) {
      incumplidas.push({ regla: 'hueco_en_la_numeracion', clave: linea.clave });
    }
    if (
      anterior !== undefined &&
      linea.diasDesdeElInicio > (anterior.fin?.diasAntes ?? -Infinity)
    ) {
      incumplidas.push({ regla: 'solape_con_la_linea_siguiente', clave: linea.clave });
    }
    return incumplidas;
  });
}

function incumplimientosDeLosEventos(
  paciente: PacienteSemilla,
  diagnostico: number,
): IncoherenciaDeHistoria[] {
  return paciente.eventos.flatMap((evento) => {
    if (evento.diasAntes > diagnostico) {
      return [{ regla: 'evento_antes_del_diagnostico' as const, clave: evento.clave }];
    }
    if (evento.diasAntes < 0) return [{ regla: 'fecha_futura' as const, clave: evento.clave }];
    return [];
  });
}
