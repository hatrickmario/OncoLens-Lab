import type { PacienteSemilla } from './tipos.js';

/**
 * (f) FX-T3-a (US-071, RN-26): mama con HER2 `3+` verificado, Ki-67 `20 %` en `requiere_revision`, dos receptores de
 * estrógeno en conflicto (el segundo apunta al primero con `conflicts_with_id`) y sin estado menopáusico. Acumula los
 * avisos clínicos del S5 en un solo caso para recorrer login → ficha → vista de caso → faltantes → análisis.
 */
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
      diasDesdeElDiagnostico: 30,
      activo: true,
      gradacion: { sistema: 'nottingham', grado: 2 },
    },
  ],
  examenes: [
    {
      clave: 'examen-ihq',
      tipo: 'IHQ',
      diasAntes: 28,
      biomarcadores: [
        {
          clave: 'her2',
          nombre: 'HER2',
          valor: '3+ (IHQ)',
          unidad: null,
          tipoResultado: 'cualitativo',
          significadoClinico: 'relevante',
        },
        {
          clave: 'receptor-estrogeno',
          nombre: 'RE',
          valor: 'Positivo (80%)',
          unidad: null,
          tipoResultado: 'cualitativo',
          significadoClinico: 'relevante',
        },
        {
          clave: 'receptor-estrogeno-en-conflicto',
          nombre: 'RE',
          valor: 'Negativo',
          unidad: null,
          tipoResultado: 'cualitativo',
          significadoClinico: 'relevante',
          estadoDeRevision: 'requiere_revision',
          enConflictoCon: 'receptor-estrogeno',
        },
        {
          clave: 'ki67',
          nombre: 'Ki-67',
          valor: '20 %',
          unidad: null,
          tipoResultado: 'cuantitativo',
          significadoClinico: 'relevante',
          estadoDeRevision: 'requiere_revision',
        },
      ],
    },
  ],
  tratamientosPrevios: [],
  eventos: [],
  atributos: [],
};
