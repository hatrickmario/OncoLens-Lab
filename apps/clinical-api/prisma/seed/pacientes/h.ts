import { biomarcador, examen, nottingham, estadoMenopausico } from './auxiliares.js';
import type { PacienteSemilla } from './tipos.js';

/** (h) US-254 · mama adyuvante tras cirugía: cuadrantectomía y letrozol en curso; HER2 1+, Ki-67 20 % por revisar, sin BRCA. */
export const pacienteH: PacienteSemilla = {
  clave: 'paciente-h',
  anioDeNacimiento: 1966,
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
      diasDesdeElDiagnostico: 150,
      activo: true,
      gradacion: nottingham(2),
    },
  ],
  examenes: [
    examen('examen-ihq', 'IHQ', 140, [
      biomarcador('receptor-estrogeno', 'RE', 'Positivo (95%)'),
      biomarcador('receptor-progesterona', 'RP', 'Positivo (40%)'),
      biomarcador('her2', 'HER2', '1+ (IHQ)'),
    ]),
    // Ki-67 en un examen propio y sin verificar: con (f) deja dos pacientes en la columna «Por revisar» del listado.
    examen('examen-ki67', 'IHQ', 130, [
      biomarcador('ki67', 'Ki-67', '20 %', {
        tipoResultado: 'cuantitativo',
        estadoDeRevision: 'requiere_revision',
      }),
    ]),
  ],
  tratamientosPrevios: [
    {
      clave: 'linea-1',
      numeroDeLinea: 1,
      setting: 'adyuvante',
      regimen: 'Letrozol',
      farmacos: ['letrozol'],
      diasDesdeElInicio: 60,
    },
  ],
  eventos: [
    { clave: 'cirugia-1', tipo: 'cirugia', diasAntes: 120, descripcion: 'Cuadrantectomía' },
  ],
  atributos: [estadoMenopausico('posmenopausica', 150)],
};
