import type { PacienteSemilla } from './tipos.js';

/** (d) Con opt-out de `analisis_ia` registrado (para el `403` de toda generación con IA, S5/S6). */
export const pacienteD: PacienteSemilla = {
  clave: 'paciente-d',
  anioDeNacimiento: 1960,
  sexo: 'F',
  diagnosticos: [
    {
      clave: 'diagnostico-1',
      cancerType: 'mama',
      histology: 'carcinoma ductal infiltrante',
      stagingSystem: 'TNM_8',
      stageValue: 'IIIA',
      performanceValue: 1,
      diasDesdeElDiagnostico: 90,
      activo: true,
      gradacion: { sistema: 'nottingham', grado: 2 },
    },
  ],
  examenes: [],
  tratamientosPrevios: [],
  eventos: [],
  atributos: [],
  optOutAnalisisIa: 'OPTOUT-SEED-D',
};
