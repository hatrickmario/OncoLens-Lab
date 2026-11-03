import type { BiomarcadorSemilla, PacienteSemilla } from './tipos.js';

/**
 * (f) FX-T3-a (US-071, RN-26): mama con HER2 `3+` verificado, Ki-67 `20 %` en `requiere_revision`, dos receptores de
 * estrógeno en conflicto (el más reciente apunta al anterior con `conflicts_with_id`) y sin estado menopáusico. Acumula
 * los avisos clínicos del S5 en un solo caso para recorrer login → ficha → vista de caso → faltantes → análisis.
 *
 * Cada biomarcador va en su propio examen, con fechas distintas: el gateway envía solo el último valor por nombre
 * (`performed_at` y luego `created_at`), y un empate lo dejaría al azar. El RE en conflicto es el más reciente, así que
 * es el que llega a Backend 2.
 */
const biomarcador = (
  clave: string,
  nombre: string,
  valor: string,
  resto: Partial<BiomarcadorSemilla> = {},
): BiomarcadorSemilla => ({
  clave,
  nombre,
  valor,
  unidad: null,
  tipoResultado: 'cualitativo',
  significadoClinico: 'relevante',
  ...resto,
});

export const pacienteF: PacienteSemilla = {
  clave: 'paciente-f',
  anioDeNacimiento: 1972,
  sexo: 'F',
  diagnosticos: [
    {
      clave: 'diagnostico-1',
      cancerType: 'mama',
      histology: 'carcinoma ductal infiltrante',
      stagingSystem: 'TNM_8',
      stageValue: 'IIA',
      performanceScale: 'ECOG',
      performanceValue: 1,
      diasDesdeElDiagnostico: 45,
      activo: true,
      gradacion: { sistema: 'nottingham', grado: 2 },
    },
  ],
  examenes: [
    {
      clave: 'examen-re',
      tipo: 'IHQ',
      diasAntes: 40,
      biomarcadores: [biomarcador('receptor-estrogeno', 'RE', 'Positivo (80%)')],
    },
    {
      clave: 'examen-her2',
      tipo: 'IHQ',
      diasAntes: 28,
      biomarcadores: [biomarcador('her2', 'HER2', '3+ (IHQ)')],
    },
    {
      clave: 'examen-ki67',
      tipo: 'IHQ',
      diasAntes: 14,
      biomarcadores: [
        biomarcador('ki67', 'Ki-67', '20 %', {
          tipoResultado: 'cuantitativo',
          estadoDeRevision: 'requiere_revision',
        }),
      ],
    },
    {
      clave: 'examen-re-control',
      tipo: 'IHQ',
      diasAntes: 7,
      biomarcadores: [
        biomarcador('receptor-estrogeno-en-conflicto', 'RE', 'Negativo', {
          estadoDeRevision: 'requiere_revision',
          enConflictoCon: { examen: 'examen-re', biomarcador: 'receptor-estrogeno' },
        }),
      ],
    },
  ],
  tratamientosPrevios: [],
  eventos: [],
  atributos: [],
};
