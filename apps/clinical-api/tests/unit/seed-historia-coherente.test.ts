import { describe, expect, it } from 'vitest';
import { historiaCoherente } from '../../prisma/seed/pacientes/coherencia.js';
import { PACIENTES_SEMILLA } from '../../prisma/seed/pacientes/indice.js';
import { pacienteK } from '../../prisma/seed/pacientes/k.js';
import type {
  PacienteSemilla,
  TratamientoPreviaSemilla,
} from '../../prisma/seed/pacientes/tipos.js';

/**
 * Regla `historiaCoherente()` (US-254 AC-2, D3): lógica pura sobre días relativos a `SEED_REFERENCE_DATE` (más días =
 * más antiguo). Sin E/S ni reloj: el paciente de prueba es sintético y se arma aquí.
 */
const linea = (
  clave: string,
  numeroDeLinea: number,
  inicio: number,
  fin?: number,
): TratamientoPreviaSemilla => ({
  clave,
  numeroDeLinea,
  setting: 'primera_linea_metastasica',
  regimen: 'Régimen de prueba',
  diasDesdeElInicio: inicio,
  ...(fin === undefined ? {} : { fin: { diasAntes: fin, motivo: 'progresion' as const } }),
});

function pacienteDePrueba(parcial: Partial<PacienteSemilla> = {}): PacienteSemilla {
  return {
    clave: 'paciente-prueba',
    anioDeNacimiento: 1970,
    sexo: 'F',
    diagnosticos: [
      {
        clave: 'diagnostico-1',
        cancerType: 'mama',
        histology: 'carcinoma ductal infiltrante',
        stagingSystem: 'TNM_8',
        stageValue: 'IV',
        performanceScale: 'ECOG',
        performanceValue: 1,
        diasDesdeElDiagnostico: 1000,
        activo: true,
      },
    ],
    examenes: [],
    tratamientosPrevios: [linea('linea-1', 1, 900, 500), linea('linea-2', 2, 480)],
    eventos: [{ clave: 'progresion-1', tipo: 'progresion', diasAntes: 500, descripcion: 'x' }],
    atributos: [],
    ...parcial,
  };
}

describe('historiaCoherente', () => {
  it('no devuelve incumplimientos cuando la historia es coherente', () => {
    expect(historiaCoherente(pacienteDePrueba())).toEqual([]);
  });

  it('nombra la línea cuando empieza antes del diagnóstico', () => {
    const paciente = pacienteDePrueba({
      tratamientosPrevios: [linea('linea-1', 1, 1200, 500), linea('linea-2', 2, 480)],
    });

    expect(historiaCoherente(paciente)).toContainEqual({
      regla: 'linea_antes_del_diagnostico',
      clave: 'linea-1',
    });
  });

  it('nombra la línea cuando su fin es anterior a su inicio', () => {
    const paciente = pacienteDePrueba({
      tratamientosPrevios: [linea('linea-1', 1, 900, 950), linea('linea-2', 2, 480)],
    });

    expect(historiaCoherente(paciente)).toContainEqual({
      regla: 'fin_antes_del_inicio',
      clave: 'linea-1',
    });
  });

  it('nombra la línea siguiente cuando empieza antes del fin de la anterior', () => {
    const paciente = pacienteDePrueba({
      tratamientosPrevios: [linea('linea-1', 1, 900, 500), linea('linea-2', 2, 520)],
    });

    expect(historiaCoherente(paciente)).toContainEqual({
      regla: 'solape_con_la_linea_siguiente',
      clave: 'linea-2',
    });
  });

  it('nombra la línea siguiente cuando la anterior sigue en curso', () => {
    const paciente = pacienteDePrueba({
      tratamientosPrevios: [linea('linea-1', 1, 900), linea('linea-2', 2, 480)],
    });

    expect(historiaCoherente(paciente)).toContainEqual({
      regla: 'solape_con_la_linea_siguiente',
      clave: 'linea-2',
    });
  });

  it('nombra la línea cuando la numeración tiene un hueco', () => {
    const paciente = pacienteDePrueba({
      tratamientosPrevios: [linea('linea-1', 1, 900, 500), linea('linea-3', 3, 480)],
    });

    expect(historiaCoherente(paciente)).toContainEqual({
      regla: 'hueco_en_la_numeracion',
      clave: 'linea-3',
    });
  });

  it('nombra el evento cuando es anterior al diagnóstico', () => {
    const paciente = pacienteDePrueba({
      eventos: [{ clave: 'cirugia-1', tipo: 'cirugia', diasAntes: 1100, descripcion: 'x' }],
    });

    expect(historiaCoherente(paciente)).toContainEqual({
      regla: 'evento_antes_del_diagnostico',
      clave: 'cirugia-1',
    });
  });

  it('nombra el evento cuando su fecha es posterior a la referencia del seed', () => {
    const paciente = pacienteDePrueba({
      eventos: [{ clave: 'respuesta-1', tipo: 'respuesta', diasAntes: -3, descripcion: 'x' }],
    });

    expect(historiaCoherente(paciente)).toContainEqual({
      regla: 'fecha_futura',
      clave: 'respuesta-1',
    });
  });

  it('nombra el fin del tratamiento cuando es posterior a la referencia del seed', () => {
    const paciente = pacienteDePrueba({
      tratamientosPrevios: [linea('linea-1', 1, 900, -10)],
    });

    expect(historiaCoherente(paciente)).toContainEqual({
      regla: 'fecha_futura',
      clave: 'linea-1',
    });
  });
});

describe('historias de los pacientes semilla de US-254', () => {
  const nuevos = PACIENTES_SEMILLA.filter((paciente) => /^paciente-[g-m]$/.test(paciente.clave));

  it('los 7 pacientes nuevos tienen una historia coherente [US-254 AC-2]', () => {
    expect(nuevos).toHaveLength(7);
    for (const paciente of nuevos) {
      expect(historiaCoherente(paciente), paciente.clave).toEqual([]);
    }
  });

  it('detecta la línea 2 de (k) que empieza antes del fin de la línea 1 [US-254 AC-2]', () => {
    const [linea1, linea2] = pacienteK.tratamientosPrevios;
    const incoherente = {
      ...pacienteK,
      tratamientosPrevios: [linea1!, { ...linea2!, diasDesdeElInicio: 600 }],
    };

    expect(historiaCoherente(incoherente)).toContainEqual({
      regla: 'solape_con_la_linea_siguiente',
      clave: 'linea-2',
    });
  });
});
