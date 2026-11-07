import {
  DOCUMENTO_SINTETICO_CHAT,
  NACIMIENTO_SINTETICO_CHAT,
  NOMBRE_SINTETICO_CHAT,
} from '../../prisma/seed/pacientes/chat.js';

/**
 * FX-12-d (US-269 AC-6): el dataset guarda la pregunta con el marcador `{identidad_sintetica:<clave>}` para no tener
 * literales de identidad (RN-14); aquí se resuelve desde el seed. La identidad es sintética y solo vive en proceso: la
 * petición que se escribe sale enmascarada por el desidentificador de producción (RN-10, RN-11).
 */
const MARCADOR = /\{identidad_sintetica:([^}]+)\}/g;

interface IdentidadSintetica {
  nombre: string;
  documento: string;
  nacimiento: string;
}

const IDENTIDADES_SINTETICAS: Readonly<Record<string, IdentidadSintetica>> = {
  'P-CHAT': {
    nombre: NOMBRE_SINTETICO_CHAT,
    documento: DOCUMENTO_SINTETICO_CHAT,
    nacimiento: NACIMIENTO_SINTETICO_CHAT,
  },
};

export interface PreguntaResuelta {
  pregunta: string;
  /** Nombre, documento y fecha de nacimiento que no deben aparecer en ninguna superficie (vacío sin marcador). */
  identidad: string[];
}

function identidadDe(clave: string): IdentidadSintetica {
  const identidad = IDENTIDADES_SINTETICAS[clave];
  if (identidad === undefined) throw new Error(`no hay identidad sintética para ${clave}`);
  return identidad;
}

export function resolverMarcadorDeIdentidad(pregunta: string): PreguntaResuelta {
  const identidad: string[] = [];
  const resuelta = pregunta.replaceAll(MARCADOR, (_marcador, clave: string) => {
    const { nombre, documento, nacimiento } = identidadDe(clave);
    identidad.push(nombre, documento, nacimiento);
    return `${nombre}, ${documento}, nacida el ${nacimiento}`;
  });
  return { pregunta: resuelta, identidad };
}
