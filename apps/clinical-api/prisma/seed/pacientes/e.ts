import type { PacienteSemilla } from './tipos.js';

/** (e) Mama sin estado menopáusico ni Ki-67: valida el checklist de faltantes ("Desconocido: falta en el paciente"). */
export const pacienteE: PacienteSemilla = {
  clave: 'paciente-e',
  anioDeNacimiento: 1980,
  sexo: 'F',
  diagnosticos: [
    {
      clave: 'diagnostico-1',
      cancerType: 'mama',
      histology: 'carcinoma ductal infiltrante',
      stagingSystem: 'TNM_8',
      stageValue: 'IB',
      performanceScale: 'ECOG',
      performanceValue: 0,
      diasDesdeElDiagnostico: 20,
      activo: true,
      gradacion: { sistema: 'nottingham', grado: 1 },
    },
  ],
  examenes: [
    {
      clave: 'examen-ihq',
      tipo: 'IHQ',
      diasAntes: 18,
      biomarcadores: [
        {
          clave: 'her2',
          nombre: 'HER2',
          valor: '1+ (IHQ)',
          unidad: null,
          tipoResultado: 'cualitativo',
          significadoClinico: 'normal',
        },
        {
          clave: 'receptor-estrogeno',
          nombre: 'RE',
          valor: 'Positivo (90%)',
          unidad: null,
          tipoResultado: 'cualitativo',
          significadoClinico: 'relevante',
        },
      ],
    },
  ],
  tratamientosPrevios: [],
  eventos: [],
  atributos: [],
};
