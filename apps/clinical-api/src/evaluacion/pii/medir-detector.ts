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
  veredictoPorTipoDirecto,
} from './medicion.js';

/**
 * Medición del detector de la opción A de ADR-40 (identidad exacta + formatos de `config/pii-formats.json`) sobre
 * `pii-mini`, en dos modos: solo con los formatos (lo que ve un texto sin identidad conocida) y con la identidad
 * conocida del propio texto (lo que B1 sabe del paciente). La identidad se arma en memoria desde las etiquetas del
 * dataset y nunca sale de este proceso. El informe lleva solo agregados y tipos (RN-10, RN-14).
 */

const CONTEXTO_DE_DOCUMENTO = 'documento';
const NOTAS_DEL_INFORME = [
  'identidad_de_referencia usa etiquetas de oro (cota de oráculo): no es la sensibilidad de producción.',
  'Los documentos no pasan por Backend 1: el gate de documentos es de Backend 2; este informe mide solo la capa de B1.',
  'La latencia p95 excluye la creación del detector por consulta (PiiDetectorFactory.para).',
  'Cobertura por palabras ausentes y falsos positivos por recuento: no equivalen a la medición por spans de B2.',
];

export type Reloj = () => number;

export interface ParametrosDeMedicion {
  /** Fracción mínima de caracteres de un valor que debe desaparecer para contarlo detectado. */
  coberturaMinima: number;
  /** Sensibilidad mínima por identificador directo (G-8). */
  sensibilidadMinima: number;
  corridas: number;
  reloj: Reloj;
  /** Identificadores directos de G-8: salen de `tipos_directos` del manifiesto del dataset. */
  tiposDirectos: readonly string[];
}

export interface MedicionDeModo {
  sensibilidadDocumentos: Record<string, Sensibilidad>;
  sensibilidadTodosLosContextos: Record<string, Sensibilidad>;
  falsosPositivosClinicos: FalsosPositivos;
  latenciaP95Ms: number;
  latenciaP95MsPorCorrida: number[];
  /** Cada tipo directo y `total` alcanzan la sensibilidad mínima en los textos de documento (falta de medición = no cumple). */
  cumpleSensibilidadMinimaPorTipoDirecto: boolean;
  tiposDirectosPorDebajo: string[];
}

export type ModoDeMedicion = 'solo_formatos' | 'identidad_de_referencia';

export interface InformeDePii {
  detector: 'opcion-a';
  textos: number;
  parametros: { coberturaMinima: number; sensibilidadMinima: number; corridas: number };
  /** Sesgos de la medición que quien lea el informe debe conocer. */
  notas: string[];
  modos: Record<ModoDeMedicion, MedicionDeModo>;
}

const valorDe = (texto: TextoSembrado, tipo: string): string[] =>
  texto.etiquetas
    .filter((etiqueta) => etiqueta.tipo === tipo)
    .map((etiqueta) => texto.texto.slice(etiqueta.inicio, etiqueta.fin));

/**
 * Identidad de referencia: la que entrega `patient-identity.reader.ts` (nombre completo y documento; sin teléfono ni
 * representante), armada con las primeras etiquetas de oro del texto. Es una cota de oráculo, no una medición de
 * producción (solo en memoria).
 */
export function identidadDesdeEtiquetas(texto: TextoSembrado): IdentidadDelPaciente {
  return {
    nombreCompleto: valorDe(texto, 'nombre')[0] ?? '',
    documento: valorDe(texto, 'documento')[0] ?? '',
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
  const veredicto = veredictoPorTipoDirecto(
    sensibilidadDocumentos,
    parametros.tiposDirectos,
    parametros.sensibilidadMinima,
  );
  return {
    sensibilidadDocumentos,
    sensibilidadTodosLosContextos: sensibilidadPorTipo(medidos, parametros.coberturaMinima),
    falsosPositivosClinicos: falsosPositivosClinicos(medidos),
    latenciaP95Ms: [...porCorrida].sort((a, b) => a - b)[Math.floor(porCorrida.length / 2)] ?? 0,
    latenciaP95MsPorCorrida: porCorrida,
    cumpleSensibilidadMinimaPorTipoDirecto: veredicto.cumple,
    tiposDirectosPorDebajo: veredicto.porDebajo,
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
    notas: NOTAS_DEL_INFORME,
    modos: {
      solo_formatos: medirModo(textos, () => sinIdentidad, parametros),
      identidad_de_referencia: medirModo(
        textos,
        (texto) => crearDetectorOpcionA(identidadDesdeEtiquetas(texto), configuracion),
        parametros,
      ),
    },
  };
}
