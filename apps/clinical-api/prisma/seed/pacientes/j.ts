import { biomarcador, examen, ki67, nottingham } from './auxiliares.js';
import type { PacienteSemilla } from './tipos.js';

/**
 * (j) US-254 · mama metastásica en primera línea: letrozol + palbociclib en curso; HER2 0, BRCA no mutado. Letrozol está
 * en el subconjunto ATC y palbociclib no: el régimen lleva el código de letrozol y queda `no_mapeado` (RN-27).
 */
export const pacienteJ: PacienteSemilla = {
  clave: 'paciente-j',
  anioDeNacimiento: 1958,
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
      diasDesdeElDiagnostico: 75,
      activo: true,
      gradacion: nottingham(2),
    },
  ],
  examenes: [
    examen('examen-ihq', 'IHQ', 70, [
      biomarcador('receptor-estrogeno', 'RE', 'Positivo (90%)'),
      biomarcador('receptor-progesterona', 'RP', 'Positivo (50%)'),
      biomarcador('her2', 'HER2', '0 (IHQ)'),
      ki67('15 %'),
    ]),
    examen('examen-molecular', 'molecular', 65, [biomarcador('brca', 'BRCA', 'No mutado')]),
  ],
  tratamientosPrevios: [
    {
      clave: 'linea-1',
      numeroDeLinea: 1,
      setting: 'primera_linea_metastasica',
      regimen: 'Letrozol + palbociclib',
      farmacos: ['letrozol', 'palbociclib'],
      diasDesdeElInicio: 45,
    },
  ],
  eventos: [],
  atributos: [
    {
      clave: 'estado-menopausico',
      atributo: 'estado_menopausico',
      valor: 'posmenopausica',
      diasAntes: 75,
    },
  ],
};
