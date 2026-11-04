import { biomarcador, examen, nottingham } from './auxiliares.js';
import type { PacienteSemilla } from './tipos.js';

/**
 * (g) US-254 · mama, diagnóstico inicial sin tratar: HER2 2+ por IHQ sin ISH, sin Ki-67 ni BRCA y sin tratamientos
 * previos (no se siembra «ninguno»: el checklist decide, P-2). Premenopáusica.
 */
export const pacienteG: PacienteSemilla = {
  clave: 'paciente-g',
  anioDeNacimiento: 1978,
  sexo: 'F',
  diagnosticos: [
    {
      clave: 'diagnostico-1',
      cancerType: 'mama',
      histology: 'carcinoma ductal infiltrante',
      stagingSystem: 'TNM_8',
      stageValue: 'IIA',
      performanceScale: 'ECOG',
      performanceValue: 0,
      diasDesdeElDiagnostico: 12,
      activo: true,
      gradacion: nottingham(2),
    },
  ],
  examenes: [
    examen('examen-ihq', 'IHQ', 10, [
      biomarcador('receptor-estrogeno', 'RE', 'Positivo (90%)'),
      biomarcador('receptor-progesterona', 'RP', 'Positivo (70%)'),
      biomarcador('her2', 'HER2', '2+ (IHQ)'),
    ]),
  ],
  tratamientosPrevios: [],
  eventos: [],
  atributos: [
    {
      clave: 'estado-menopausico',
      atributo: 'estado_menopausico',
      valor: 'premenopausica',
      diasAntes: 12,
    },
  ],
};
