import type { IdentidadDelPaciente, PiiDetector, ResultadoDeEnmascarado } from '../ports.js';
import type { ConfiguracionDePii, EtapaDeEnmascarado, FormatoDePii } from './pii-formats.config.js';

/**
 * Detector de la opción A de ADR-40 `[S1 resp. 3]`: coincidencia exacta con la identidad conocida del paciente y de su
 * representante, más los formatos de `config/pii-formats.json` (L1D-166) y la regla de fechas de `pii-masks.json`.
 * Devuelve el texto enmascarado y los TIPOS detectados, nunca los valores.
 */

/** Resultado parcial de una etapa: el texto ya sustituido y lo que se detectó. */
interface ResultadoDeEtapa {
  texto: string;
  tipos: Set<string>;
  hallazgos: number;
}

export interface TokensDeIdentidad {
  /** Palabras del nombre (paciente y representante), normalizadas y con la longitud mínima. */
  nombres: Set<string>;
  /** Documentos (paciente y representante) solo con dígitos. */
  documentos: string[];
  telefonos: string[];
}

const PALABRA = /[\p{L}\p{M}]+/gu;
const SEPARADORES_DE_DIGITOS = '[.\\- ]?';

/** Sin tildes ni mayúsculas: `Lucía` = `lucia`. */
export function normalizarParaComparar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

const soloDigitos = (texto: string): string => texto.replace(/\D/g, '');

/** Tokens de la identidad conocida; los nombres más cortos que `minimoDeNombre` (partículas) se ignoran. */
export function tokensDeIdentidad(
  identidad: IdentidadDelPaciente,
  minimoDeNombre: number,
): TokensDeIdentidad {
  const personas = [
    { nombre: identidad.nombreCompleto, documento: identidad.documento },
    ...(identidad.representante === null || identidad.representante === undefined
      ? []
      : [
          {
            nombre: identidad.representante.nombreCompleto,
            documento: identidad.representante.documento,
          },
        ]),
  ];
  const nombres = new Set(
    personas
      .flatMap(({ nombre }) => normalizarParaComparar(nombre).match(PALABRA) ?? [])
      .filter((palabra) => palabra.length >= minimoDeNombre),
  );
  return {
    nombres,
    documentos: personas.map(({ documento }) => soloDigitos(documento)).filter(Boolean),
    telefonos: [soloDigitos(identidad.telefono ?? '')].filter(Boolean),
  };
}

const sinHallazgos = (texto: string): ResultadoDeEtapa => ({
  texto,
  tipos: new Set(),
  hallazgos: 0,
});

/** Cada dígito en orden, con separadores opcionales entre ellos y sin dígitos pegados a los lados. */
function expresionDeNumero(digitos: string): RegExp {
  return new RegExp(`(?<![\\p{N}])${[...digitos].join(SEPARADORES_DE_DIGITOS)}(?![\\p{N}])`, 'gu');
}

function sustituirNumeros(
  entrada: ResultadoDeEtapa,
  numeros: string[],
  marcador: string,
  tipo: string,
): ResultadoDeEtapa {
  let { texto, hallazgos } = entrada;
  const tipos = new Set(entrada.tipos);
  for (const numero of numeros) {
    texto = texto.replace(expresionDeNumero(numero), () => {
      hallazgos += 1;
      tipos.add(tipo);
      return marcador;
    });
  }
  return { texto, tipos, hallazgos };
}

function etapaDeIdentidad(
  texto: string,
  tokens: TokensDeIdentidad,
  configuracion: ConfiguracionDePii,
): ResultadoDeEtapa {
  const { marcadoresDeIdentidad } = configuracion;
  let hallazgosDeNombre = 0;
  const conNombres = texto.replace(PALABRA, (palabra) => {
    if (!tokens.nombres.has(normalizarParaComparar(palabra))) return palabra;
    hallazgosDeNombre += 1;
    return marcadoresDeIdentidad.nombre;
  });
  const nombres: ResultadoDeEtapa = {
    texto: conNombres,
    tipos: new Set(hallazgosDeNombre > 0 ? ['nombre'] : []),
    hallazgos: hallazgosDeNombre,
  };
  const conDocumentos = sustituirNumeros(
    nombres,
    tokens.documentos,
    marcadoresDeIdentidad.documento,
    'documento',
  );
  return sustituirNumeros(
    conDocumentos,
    tokens.telefonos,
    marcadoresDeIdentidad.telefono,
    'telefono',
  );
}

function etapaDeFechas(texto: string, configuracion: ConfiguracionDePii): ResultadoDeEtapa {
  const { marcador, expresiones } = configuracion.fechas;
  let hallazgos = 0;
  let enmascarado = texto;
  for (const expresion of expresiones) {
    enmascarado = enmascarado.replace(expresion, () => {
      hallazgos += 1;
      return marcador;
    });
  }
  return { texto: enmascarado, tipos: new Set(hallazgos > 0 ? ['fecha'] : []), hallazgos };
}

/** ¿Los dígitos del valor caen dentro de los límites del formato (p. ej. documento de 6 a 12)? */
function cumpleLosDigitos(formato: FormatoDePii, valor: string): boolean {
  const digitos = soloDigitos(valor).length;
  return digitos >= formato.digitosMin && digitos <= formato.digitosMax;
}

/** Sustituye solo el grupo `valor` de cada coincidencia (la palabra clave se conserva). */
function sustituirFormato(texto: string, formato: FormatoDePii): ResultadoDeEtapa {
  const rangos: [number, number][] = [];
  for (const coincidencia of texto.matchAll(formato.expresion)) {
    const rango = coincidencia.indices?.groups?.['valor'];
    const valor = coincidencia.groups?.['valor'];
    if (rango !== undefined && valor !== undefined && cumpleLosDigitos(formato, valor)) {
      rangos.push([rango[0], rango[1]]);
    }
  }
  let resultado = '';
  let cursor = 0;
  for (const [inicio, fin] of rangos) {
    resultado += texto.slice(cursor, inicio) + formato.marcador;
    cursor = fin;
  }
  return {
    texto: resultado + texto.slice(cursor),
    tipos: new Set(rangos.length > 0 ? [formato.tipo] : []),
    hallazgos: rangos.length,
  };
}

function etapaDeFormatos(texto: string, configuracion: ConfiguracionDePii): ResultadoDeEtapa {
  let acumulado = sinHallazgos(texto);
  for (const formato of configuracion.formatos) {
    const etapa = sustituirFormato(acumulado.texto, formato);
    acumulado = {
      texto: etapa.texto,
      tipos: new Set([...acumulado.tipos, ...etapa.tipos]),
      hallazgos: acumulado.hallazgos + etapa.hallazgos,
    };
  }
  return acumulado;
}

export function crearDetectorOpcionA(
  identidad: IdentidadDelPaciente | null,
  configuracion: ConfiguracionDePii,
): PiiDetector {
  const tokens =
    identidad === null ? null : tokensDeIdentidad(identidad, configuracion.nameTokenMinLength);
  const etapas: Record<EtapaDeEnmascarado, (texto: string) => ResultadoDeEtapa> = {
    identidad: (texto) =>
      tokens === null ? sinHallazgos(texto) : etapaDeIdentidad(texto, tokens, configuracion),
    fechas: (texto) => etapaDeFechas(texto, configuracion),
    formatos: (texto) => etapaDeFormatos(texto, configuracion),
  };
  return {
    enmascarar(entrada): ResultadoDeEnmascarado {
      let texto = entrada;
      const tipos = new Set<string>();
      let hallazgos = 0;
      for (const etapa of configuracion.orden) {
        const resultado = etapas[etapa](texto);
        texto = resultado.texto;
        resultado.tipos.forEach((tipo) => tipos.add(tipo));
        hallazgos += resultado.hallazgos;
      }
      return { texto, findingTypes: [...tipos].sort(), hallazgos };
    },
  };
}
