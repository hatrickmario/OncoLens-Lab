import { idDeBiomarcador, idDeTratamiento, idSembrado } from '../../../prisma/seed/determinismo.js';
import { identidadSinteticaDe } from '../../../prisma/seed/identidades.js';
import {
  DOCUMENTO_SINTETICO_CHAT,
  NACIMIENTO_SINTETICO_CHAT,
  NOMBRE_SINTETICO_CHAT,
  PACIENTE_CHAT,
} from '../../../prisma/seed/pacientes/chat.js';
import { PACIENTES_SEMILLA } from '../../../prisma/seed/pacientes/indice.js';
import type { PacienteSemilla } from '../../../prisma/seed/pacientes/tipos.js';

/** Marcador de identidad de la pregunta de un caso: `{identidad_sintetica:<paciente>}`. */
const MARCADOR_DE_IDENTIDAD = /\{identidad_sintetica:([^}]+)\}/g;
/** Único paciente sintético con identidad conocida en el dataset (FX-12-d). */
const PACIENTE_DEL_MARCADOR = 'P-CHAT';

/** El marcador de identidad nombra a un paciente que el seed no conoce. */
export class MarcadorDeIdentidadDesconocidoError extends Error {
  constructor() {
    super('el marcador de identidad nombra un paciente que el seed no conoce');
    this.name = 'MarcadorDeIdentidadDesconocidoError';
  }
}

/** Una clave de `hechos_esperados` no corresponde a ningún dato del seed ni de la petición preparada. */
export class HechoEsperadoNoEncontradoError extends Error {
  constructor(readonly clave: string) {
    super(`el seed no tiene el hecho ${clave}`);
    this.name = 'HechoEsperadoNoEncontradoError';
  }
}

/** La clave de paciente del dataset no es la de ningún paciente del seed sintético. */
export class PacienteDelSeedDesconocidoError extends Error {
  constructor(readonly clave: string) {
    super(`el seed no tiene el paciente ${clave}`);
    this.name = 'PacienteDelSeedDesconocidoError';
  }
}

/**
 * RN-10: la pregunta del caso con el marcador de identidad sustituido por la identidad sintética de `P-CHAT` del seed
 * (nombre, documento y fecha de nacimiento), tal como la escribiría un usuario. Se resuelve ANTES de enmascarar: así se
 * mide que la desidentificación de producción la retira. El dataset no contiene literales de identidad.
 */
export function resolverMarcadorDeIdentidad(pregunta: string): string {
  return pregunta.replaceAll(MARCADOR_DE_IDENTIDAD, (_marcador, paciente: string) => {
    if (paciente !== PACIENTE_DEL_MARCADOR) throw new MarcadorDeIdentidadDesconocidoError();
    return `${NOMBRE_SINTETICO_CHAT}, ${DOCUMENTO_SINTETICO_CHAT}, nacida el ${NACIMIENTO_SINTETICO_CHAT}`;
  });
}

/** Id del dato sembrado que respalda una clave `<paciente>/<recurso>`; `null` si el seed no tiene ese recurso. */
export function recursoDelSeed(clave: string): string | null {
  const [clavePaciente, recurso, ...resto] = clave.split('/');
  if (clavePaciente === undefined || recurso === undefined || resto.length > 0) return null;
  // P-CHAT no es un `PacienteSemilla`: su siembra usa la clave natural `<paciente>/<recurso>` como id.
  if (clavePaciente === PACIENTE_CHAT) return idSembrado(clave);
  const paciente = PACIENTES_SEMILLA.find((candidato) => candidato.clave === clavePaciente);
  if (paciente === undefined) return null;
  if (paciente.tratamientosPrevios.some((t) => t.clave === recurso)) {
    return idDeTratamiento(clavePaciente, recurso);
  }
  if (
    [...paciente.diagnosticos, ...paciente.eventos, ...paciente.atributos].some(
      (dato) => dato.clave === recurso,
    )
  ) {
    return idSembrado(clave);
  }
  return idDelBiomarcadorPorRecurso(paciente, recurso);
}

/** El biomarcador por su `clave` o, si la clave es la de un examen con un solo biomarcador (`psa-2`), el de ese examen. */
function idDelBiomarcadorPorRecurso(paciente: PacienteSemilla, recurso: string): string | null {
  const examenDelBiomarcador = paciente.examenes.find((e) =>
    e.biomarcadores.some((b) => b.clave === recurso),
  );
  if (examenDelBiomarcador !== undefined) {
    return idDeBiomarcador(paciente.clave, examenDelBiomarcador.clave, recurso);
  }
  const examen = paciente.examenes.find((e) => e.clave === recurso);
  const unico = examen?.biomarcadores.length === 1 ? examen.biomarcadores[0] : undefined;
  return examen === undefined || unico === undefined
    ? null
    : idDeBiomarcador(paciente.clave, examen.clave, unico.clave);
}

/**
 * Claves del seed de `hechos_esperados` → `factRef` de ESA petición. Solo se escriben claves semánticas y `factRef`: el
 * identificador del recurso se usa aquí para casar y no sale (RN-10, el mapa `factRef → recurso` no sale de Backend 1).
 */
export function traducirHechosEsperados(
  hechosEsperados: readonly string[],
  enlaces: readonly { factRef: string; resourceId: string }[],
  recurso: (clave: string) => string | null = recursoDelSeed,
): Record<string, string> {
  const traducidos: Record<string, string> = {};
  for (const clave of hechosEsperados) {
    const idDelRecurso = recurso(clave);
    const enlace = enlaces.find((candidato) => candidato.resourceId === idDelRecurso);
    if (idDelRecurso === null || enlace === undefined)
      throw new HechoEsperadoNoEncontradoError(clave);
    traducidos[clave] = enlace.factRef;
  }
  return traducidos;
}

/** Textos de la identidad sintética del paciente que la suite cuenta en el estado y en los logs (solo para contarlos). */
export function identidadSinteticaDelPaciente(clave: string): readonly string[] {
  if (clave === PACIENTE_CHAT) {
    return [NOMBRE_SINTETICO_CHAT, DOCUMENTO_SINTETICO_CHAT, NACIMIENTO_SINTETICO_CHAT];
  }
  const ordinal = PACIENTES_SEMILLA.findIndex((paciente) => paciente.clave === clave) + 1;
  if (ordinal === 0) throw new PacienteDelSeedDesconocidoError(clave);
  const { nombreCompleto, numeroDeDocumento } = identidadSinteticaDe(idSembrado(clave), ordinal);
  return [nombreCompleto, numeroDeDocumento];
}

/** Ids de los pacientes del seed sintético: los de `PACIENTES_SEMILLA` y el de `P-CHAT`. */
export function idsDePacientesDelSeed(): ReadonlySet<string> {
  return new Set([
    ...PACIENTES_SEMILLA.map((paciente) => idSembrado(paciente.clave)),
    idSembrado(PACIENTE_CHAT),
  ]);
}
