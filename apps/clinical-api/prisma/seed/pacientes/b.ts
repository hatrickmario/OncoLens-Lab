import type { PacienteSemilla } from './tipos.js';

/** (b) Próstata ISUP 3 con serie de tres PSA fechados, tratamiento previo (ADT) y evento de progresión. */
export const pacienteB: PacienteSemilla = {
  clave: 'paciente-b',
  anioDeNacimiento: 1955,
  sexo: 'M',
  diagnosticos: [
    {
      clave: 'diagnostico-1',
      cancerType: 'prostata',
      histology: 'adenocarcinoma acinar',
      stagingSystem: 'TNM_8',
      stageValue: 'T2cN0M0',
      performanceValue: 0,
      diasDesdeElDiagnostico: 57,
      activo: true,
      gradacion: {
        sistema: 'gleason_isup',
        patronPrimario: 4,
        patronSecundario: 3,
        puntaje: 7,
        grupoIsup: 3,
        muestra: { specimenType: 'biopsia', gradeScope: 'peor' },
      },
    },
  ],
  examenes: [
    { clave: 'psa-1', diasAntes: 229, valor: '4.2' },
    { clave: 'psa-2', diasAntes: 57, valor: '9.8' },
    { clave: 'psa-3', diasAntes: 20, valor: '12.4' },
  ].map(({ clave, diasAntes, valor }) => ({
    clave,
    tipo: 'laboratorio',
    diasAntes,
    biomarcadores: [
      {
        clave: 'psa',
        nombre: 'PSA',
        valor,
        unidad: 'ng/mL',
        tipoResultado: 'cuantitativo' as const,
        significadoClinico: 'alterado' as const,
      },
    ],
  })),
  tratamientosPrevios: [
    {
      clave: 'adt',
      numeroDeLinea: 1,
      setting: 'primera_linea_metastasica',
      regimen: 'Deprivación androgénica',
      diasDesdeElInicio: 229,
    },
  ],
  eventos: [
    {
      clave: 'progresion-bioquimica',
      tipo: 'progresion',
      diasAntes: 20,
      descripcion: 'Progresión bioquímica',
    },
  ],
  atributos: [
    {
      clave: 'estado-castracion',
      atributo: 'estado_castracion',
      valor: 'sensible',
      diasAntes: 57,
    },
  ],
};
