import { examen, gleasonEnBiopsia, psa } from './auxiliares.js';
import type { PacienteSemilla } from './tipos.js';

/**
 * (l) US-254 · próstata metastásica sensible a la castración: deprivación androgénica con leuprorelina (su ATC sale del catálogo) más
 * abiraterona, que no está en el subconjunto ATC (el régimen queda `no_mapeado`, RN-27). Sin genes HRR: un faltante.
 */
export const pacienteL: PacienteSemilla = {
  clave: 'paciente-l',
  anioDeNacimiento: 1952,
  sexo: 'M',
  diagnosticos: [
    {
      clave: 'diagnostico-1',
      cancerType: 'prostata',
      histology: 'adenocarcinoma acinar',
      stagingSystem: 'TNM_8',
      stageValue: 'T3aN1M1b',
      performanceScale: 'ECOG',
      performanceValue: 1,
      diasDesdeElDiagnostico: 50,
      activo: true,
      gradacion: gleasonEnBiopsia(4, 4),
    },
  ],
  examenes: [
    examen('psa-1', 'laboratorio', 52, [psa('psa', '48.0')]),
    examen('psa-2', 'laboratorio', 10, [psa('psa', '6.2')]),
  ],
  tratamientosPrevios: [
    {
      clave: 'linea-1',
      numeroDeLinea: 1,
      setting: 'primera_linea_metastasica',
      regimen: 'Leuprorelina + abiraterona',
      farmacos: ['leuprorelina', 'abiraterona'],
      diasDesdeElInicio: 40,
    },
  ],
  eventos: [],
  atributos: [
    {
      clave: 'estado-castracion',
      atributo: 'estado_castracion',
      valor: 'sensible_castracion',
      diasAntes: 50,
    },
    { clave: 'sitios-metastasicos', atributo: 'sitios_metastasicos', valor: 'oseo', diasAntes: 50 },
  ],
};
