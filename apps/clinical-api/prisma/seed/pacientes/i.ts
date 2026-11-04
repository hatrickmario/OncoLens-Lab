import { biomarcador, examen, ki67, nottingham } from './auxiliares.js';
import type { PacienteSemilla } from './tipos.js';

/**
 * (i) US-254 · mama con recaída local: mastectomía y tamoxifeno adyuvante terminado por la recaída (el evento de recaída
 * cierra la línea). El tamoxifeno no está en el subconjunto ATC del catálogo: queda `no_mapeado` (RN-27).
 */
export const pacienteI: PacienteSemilla = {
  clave: 'paciente-i',
  anioDeNacimiento: 1961,
  sexo: 'F',
  diagnosticos: [
    {
      clave: 'diagnostico-1',
      cancerType: 'mama',
      histology: 'carcinoma ductal infiltrante',
      stagingSystem: 'TNM_8',
      stageValue: 'IIB',
      performanceScale: 'ECOG',
      performanceValue: 1,
      diasDesdeElDiagnostico: 1900,
      activo: true,
      gradacion: nottingham(3),
    },
  ],
  examenes: [
    examen('examen-ihq', 'IHQ', 1890, [
      biomarcador('receptor-estrogeno', 'RE', 'Positivo (80%)'),
      biomarcador('receptor-progesterona', 'RP', 'Negativo'),
      biomarcador('her2', 'HER2', '1+ (IHQ)'),
      ki67('30 %'),
    ]),
  ],
  tratamientosPrevios: [
    {
      clave: 'linea-1',
      numeroDeLinea: 1,
      setting: 'adyuvante',
      regimen: 'Tamoxifeno',
      diasDesdeElInicio: 1830,
      fin: { diasAntes: 30, motivo: 'progresion' },
    },
  ],
  eventos: [
    { clave: 'cirugia-1', tipo: 'cirugia', diasAntes: 1860, descripcion: 'Mastectomía' },
    {
      clave: 'recaida-1',
      tipo: 'recaida',
      diasAntes: 30,
      descripcion: 'Recaída local en pared torácica',
      cierraLinea: 'linea-1',
    },
  ],
  atributos: [
    {
      clave: 'estado-menopausico',
      atributo: 'estado_menopausico',
      valor: 'posmenopausica',
      diasAntes: 1900,
    },
  ],
};
