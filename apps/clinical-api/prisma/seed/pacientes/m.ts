import { biomarcador, examen, gleasonEnBiopsia, psa } from './auxiliares.js';
import type { PacienteSemilla } from './tipos.js';

/**
 * (m) US-254 · próstata metastásica resistente a la castración: leuprorelina + docetaxel terminado por progresión y
 * enzalutamida en curso (sin código ATC en el catálogo: `no_mapeado`, RN-27). Genes HRR presentes.
 */
export const pacienteM: PacienteSemilla = {
  clave: 'paciente-m',
  anioDeNacimiento: 1948,
  sexo: 'M',
  diagnosticos: [
    {
      clave: 'diagnostico-1',
      cancerType: 'prostata',
      histology: 'adenocarcinoma acinar',
      stagingSystem: 'TNM_8',
      stageValue: 'T3bN1M1b',
      performanceScale: 'ECOG',
      performanceValue: 1,
      diasDesdeElDiagnostico: 1100,
      activo: true,
      gradacion: gleasonEnBiopsia(4, 5),
    },
  ],
  examenes: [
    examen('psa-1', 'laboratorio', 1100, [psa('psa', '85.0')]),
    examen('psa-2', 'laboratorio', 400, [psa('psa', '0.8')]),
    examen('psa-3', 'laboratorio', 30, [psa('psa', '14.5')]),
    examen('examen-molecular', 'molecular', 120, [biomarcador('hrr', 'HRR', 'No mutado')]),
  ],
  tratamientosPrevios: [
    {
      clave: 'linea-1',
      numeroDeLinea: 1,
      setting: 'primera_linea_metastasica',
      regimen: 'Leuprorelina + docetaxel',
      farmacos: ['leuprorelina', 'docetaxel'],
      diasDesdeElInicio: 1080,
      fin: { diasAntes: 90, motivo: 'progresion' },
    },
    {
      clave: 'linea-2',
      numeroDeLinea: 2,
      setting: 'segunda_linea_metastasica',
      regimen: 'Enzalutamida',
      diasDesdeElInicio: 60,
    },
  ],
  eventos: [
    {
      clave: 'progresion-1',
      tipo: 'progresion',
      diasAntes: 90,
      descripcion: 'Progresión bioquímica y ósea',
      cierraLinea: 'linea-1',
    },
  ],
  atributos: [
    {
      clave: 'estado-castracion',
      atributo: 'estado_castracion',
      valor: 'resistente_castracion',
      diasAntes: 100,
    },
    {
      clave: 'sitios-metastasicos',
      atributo: 'sitios_metastasicos',
      valor: 'oseo',
      diasAntes: 100,
    },
  ],
};
