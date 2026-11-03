import type { PacienteSemilla } from './tipos.js';

/** (a) Mama HER2+ completa: TNM_8 IIA, ECOG 1, HER2 3+, RE positivo, menopausia, histología y grado. */
export const pacienteA: PacienteSemilla = {
  clave: 'paciente-a',
  anioDeNacimiento: 1968,
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
      clave: 'examen-ihq',
      tipo: 'IHQ',
      diasAntes: 41,
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
      ],
    },
  ],
  tratamientosPrevios: [],
  eventos: [],
  atributos: [
    {
      clave: 'estado-menopausico',
      atributo: 'estado_menopausico',
      valor: 'posmenopausica',
      diasAntes: 45,
    },
  ],
  // Sin nombres, documentos ni teléfonos: texto clínico genérico (RN-13, RN-14).
  notas: [
    {
      clave: 'nota-comorbilidad',
      tipo: 'comorbilidad',
      texto: 'Hipertensión arterial en tratamiento.',
      diasAntes: 30,
    },
    {
      clave: 'nota-libre',
      tipo: 'nota_libre',
      texto: 'Refiere buena tolerancia al tratamiento y sin molestias nuevas.',
      diasAntes: 7,
    },
  ],
};
