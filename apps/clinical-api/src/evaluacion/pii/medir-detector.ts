import { crearDetectorOpcionA } from '../../modules/evidence-analysis/deidentification/pii-detector.opcion-a.js';
import type { ConfiguracionDePii } from '../../modules/evidence-analysis/deidentification/pii-formats.config.js';
import type { IdentidadDelPaciente, PiiDetector } from '../../modules/evidence-analysis/ports.js';
import {
  falsosPositivosClinicos,
  p95PorRango,
  sensibilidadPorTipo,
  type FalsosPositivos,
  type Sensibilidad,
  type TextoMedido,
  type TextoSembrado,
} from './medicion.js';

/**
 * Medición del detector de la opción A de ADR-40 (identidad exacta + formatos de `config/pii-formats.json`) sobre
 * `pii-mini`, en dos modos: solo con los formatos (lo que ve un texto sin identidad conocida) y con la identidad
 * conocida del propio texto (lo que B1 sabe del paciente). La identidad se arma en memoria desde las etiquetas del
 * dataset y nunca sale de este proceso. El informe lleva solo agregados y tipos (RN-10, RN-14).
 */

const CONTEXTO_DE_DOCUMENTO = 'documento';
const TIPOS_DIRECTOS = [
  'nombre',
  'documento',
  'telefono',
  'correo',
  'direccion',
  'fecha_nacimiento',
] as const;

export type Reloj = () => number;

export interface ParametrosDeMedicion {
  /** Fracción mínima de caracteres de un valor que debe desaparecer para contarlo detectado. */
  coberturaMinima: number;
  /** Sensibilidad mínima por identificador directo (G-8). */
  sensibilidadMinima: number;
  corridas: number;
  reloj: Reloj;
}

export interface MedicionDeModo {
  sensibilidadDocumentos: Record<string, Sensibilidad>;
  sensibilidadTodosLosContextos: Record<string, Sensibilidad>;
  falsosPositivosClinicos: FalsosPositivos;
  latenciaP95Ms: number;
  latenciaP95MsPorCorrida: number[];
  /** G-8: todos los identificadores directos de los textos de documento alcanzan la sensibilidad mínima. */
  cumpleG8EnDocumentos: boolean;
  tiposDirectosPorDebajo: string[];
}

export type ModoDeMedicion = 'solo_formatos' | 'con_identidad_conocida';

export interface InformeDePii {
  detector: 'opcion-a';
  textos: number;
  parametros: { coberturaMinima: number; sensibilidadMinima: number; corridas: number };
  modos: Record<ModoDeMedicion, MedicionDeModo>;
}

const valorDe = (texto: TextoSembrado, tipo: string): string[] =>
  texto.etiquetas
    .filter((etiqueta) => etiqueta.tipo === tipo)
    .map((etiqueta) => texto.texto.slice(etiqueta.inicio, etiqueta.fin));

/** La identidad que B1 conocería de ese texto, armada desde sus etiquetas sembradas (solo en memoria). */
export function identidadDesdeEtiquetas(texto: TextoSembrado): IdentidadDelPaciente {
  return {
    nombreCompleto: valorDe(texto, 'nombre').join(' '),
    documento: valorDe(texto, 'documento')[0] ?? '',
    telefono: valorDe(texto, 'telefono')[0] ?? null,
  };
}

type FabricaDeDetector = (texto: TextoSembrado) => PiiDetector;

function medirLatenciasMs(
  textos: TextoSembrado[],
  detectorDe: FabricaDeDetector,
  reloj: Reloj,
): number[] {
  return textos.map((texto) => {
    const detector = detectorDe(texto);
    const inicio = reloj();
    detector.enmascarar(texto.texto);
    return reloj() - inicio;
  });
}

function tiposDirectosPorDebajo(
  sensibilidad: Record<string, Sensibilidad>,
  minima: number,
): string[] {
  return TIPOS_DIRECTOS.filter((tipo) => (sensibilidad[tipo]?.valor ?? 0) < minima);
}

function medirModo(
  textos: TextoSembrado[],
  detectorDe: FabricaDeDetector,
  parametros: ParametrosDeMedicion,
): MedicionDeModo {
  const medidos: TextoMedido[] = textos.map((original) => ({
    original,
    enmascarado: detectorDe(original).enmascarar(original.texto).texto,
  }));
  const documentos = medidos.filter(({ original }) => original.contexto === CONTEXTO_DE_DOCUMENTO);
  const sensibilidadDocumentos = sensibilidadPorTipo(documentos, parametros.coberturaMinima);
  const porCorrida = Array.from({ length: parametros.corridas }, () =>
    p95PorRango(medirLatenciasMs(textos, detectorDe, parametros.reloj)),
  );
  const porDebajo = tiposDirectosPorDebajo(sensibilidadDocumentos, parametros.sensibilidadMinima);
  return {
    sensibilidadDocumentos,
    sensibilidadTodosLosContextos: sensibilidadPorTipo(medidos, parametros.coberturaMinima),
    falsosPositivosClinicos: falsosPositivosClinicos(medidos),
    latenciaP95Ms: [...porCorrida].sort((a, b) => a - b)[Math.floor(porCorrida.length / 2)] ?? 0,
    latenciaP95MsPorCorrida: porCorrida,
    cumpleG8EnDocumentos: porDebajo.length === 0,
    tiposDirectosPorDebajo: porDebajo,
  };
}

export function medirDetectorOpcionA(
  textos: TextoSembrado[],
  configuracion: ConfiguracionDePii,
  parametros: ParametrosDeMedicion,
): InformeDePii {
  const sinIdentidad = crearDetectorOpcionA(null, configuracion);
  return {
    detector: 'opcion-a',
    textos: textos.length,
    parametros: {
      coberturaMinima: parametros.coberturaMinima,
      sensibilidadMinima: parametros.sensibilidadMinima,
      corridas: parametros.corridas,
    },
    modos: {
      solo_formatos: medirModo(textos, () => sinIdentidad, parametros),
      con_identidad_conocida: medirModo(
        textos,
        (texto) => crearDetectorOpcionA(identidadDesdeEtiquetas(texto), configuracion),
        parametros,
      ),
    },
  };
}
