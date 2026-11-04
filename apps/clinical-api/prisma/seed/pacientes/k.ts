import { biomarcador, examen, ki67, nottingham, estadoMenopausico } from './auxiliares.js';
import type { PacienteSemilla } from './tipos.js';

/**
 * (k) US-254 · mama HER2 positiva metastásica tras trastuzumab, pertuzumab y trastuzumab emtansina: dos líneas terminadas
 * por progresión, cada una cerrada por su evento. Los 12 ítems críticos de mama están presentes (sin faltantes).
 *
 * El examen ISH es anterior al de IHQ: el gateway envía el último valor de HER2 por fecha, y así llega la IHQ.
 */
export const pacienteK: PacienteSemilla = {
  clave: 'paciente-k',
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
      diasDesdeElDiagnostico: 1400,
      activo: true,
      gradacion: nottingham(3),
    },
  ],
  examenes: [
    examen('examen-ish', 'ISH', 1392, [biomarcador('her2-ish', 'HER2', 'Amplificado (ISH)')]),
    examen('examen-ihq', 'IHQ', 1390, [
      biomarcador('her2', 'HER2', '3+ (IHQ)'),
      biomarcador('receptor-estrogeno', 'RE', 'Negativo'),
      biomarcador('receptor-progesterona', 'RP', 'Negativo'),
      ki67('40 %'),
    ]),
    examen('examen-molecular', 'molecular', 1380, [biomarcador('brca', 'BRCA', 'No mutado')]),
  ],
  tratamientosPrevios: [
    {
      clave: 'linea-1',
      numeroDeLinea: 1,
      setting: 'primera_linea_metastasica',
      regimen: 'Trastuzumab + pertuzumab + docetaxel',
      farmacos: ['trastuzumab', 'pertuzumab', 'docetaxel'],
      diasDesdeElInicio: 1370,
      fin: { diasAntes: 560, motivo: 'progresion' },
    },
    {
      clave: 'linea-2',
      numeroDeLinea: 2,
      setting: 'segunda_linea_metastasica',
      regimen: 'Trastuzumab emtansina',
      farmacos: ['trastuzumab emtansina'],
      diasDesdeElInicio: 540,
      fin: { diasAntes: 40, motivo: 'progresion' },
    },
  ],
  eventos: [
    {
      clave: 'progresion-1',
      tipo: 'progresion',
      diasAntes: 560,
      descripcion: 'Progresión hepática',
      cierraLinea: 'linea-1',
    },
    {
      clave: 'progresion-2',
      tipo: 'progresion',
      diasAntes: 40,
      descripcion: 'Progresión pulmonar y hepática',
      cierraLinea: 'linea-2',
    },
  ],
  atributos: [estadoMenopausico('posmenopausica', 1400)],
};
