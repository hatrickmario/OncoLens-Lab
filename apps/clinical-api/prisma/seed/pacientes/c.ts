import type { PacienteSemilla } from './tipos.js';

/** (c) Un diagnóstico inactivo (anterior) y uno activo: valida `is_active`. Su biomarcador no está en el catálogo. */
export const pacienteC: PacienteSemilla = {
  clave: 'paciente-c',
  anioDeNacimiento: 1972,
  sexo: 'F',
  diagnosticos: [
    {
      clave: 'diagnostico-1',
      cancerType: 'mama',
      histology: 'carcinoma ductal in situ',
      stagingSystem: 'TNM_8',
      stageValue: '0',
      performanceScale: 'ECOG',
      performanceValue: 0,
      diasDesdeElDiagnostico: 1500,
      activo: false,
    },
    {
      clave: 'diagnostico-2',
      cancerType: 'mama',
      histology: 'carcinoma lobulillar infiltrante',
      stagingSystem: 'TNM_8',
      stageValue: 'IIB',
      performanceScale: 'ECOG',
      performanceValue: 1,
      diasDesdeElDiagnostico: 30,
      activo: true,
      gradacion: { sistema: 'nottingham', grado: 3 },
    },
  ],
  examenes: [
    {
      clave: 'examen-ihq',
      tipo: 'IHQ',
      diasAntes: 28,
      biomarcadores: [
        {
          clave: 'receptor-progesterona',
          nombre: 'RP',
          valor: 'Positivo (60%)',
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
