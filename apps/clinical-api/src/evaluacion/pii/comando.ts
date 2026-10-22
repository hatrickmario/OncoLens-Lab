import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ConfiguracionInvalidaError, readDeidentificationConfig } from '../../config/index.js';
import { cargarConfiguracionDePii } from '../../modules/evidence-analysis/deidentification/pii-formats.config.js';
import { cargarCorpusPiiMini, CorpusInvalidoError, type EjecutarProceso } from './corpus.js';
import { medirDetectorOpcionA, type InformeDePii, type Reloj } from './medir-detector.js';

/**
 * Comando `npm run eval:pii` (US-013 AC-1, ADR-40): mide la sensibilidad del detector de Backend 1 sobre `pii-mini` con
 * los formatos de `config/pii-formats.json` y escribe un JSON de agregados. Solo agregados y tipos: ningún valor ni
 * texto del corpus llega al informe, a la salida ni a los logs (RN-10, RN-14).
 */

export const SALIDA_OK = 0;
export const SALIDA_USO = 2;
export const SALIDA_FALLO = 1;

/** Valores por omisión del comando (argumentos, no constantes del algoritmo; ADR-40 §Configuración). */
const COBERTURA_MINIMA_POR_OMISION = 0.5;
const SENSIBILIDAD_MINIMA_POR_OMISION = 0.95;
const CORRIDAS_POR_OMISION = 3;
const SALIDA_POR_OMISION = path.join('reports', 'adr40', 'clinical-api-pii.json');
const FORMATOS_POR_OMISION = path.join('config', 'pii-formats.json');
const MASCARAS_POR_OMISION = path.join('apps', 'clinical-api', 'config', 'pii-masks.json');

export interface DependenciasDelComando {
  raizDelRepo: string;
  entorno: NodeJS.ProcessEnv;
  reloj: Reloj;
  stdout: (texto: string) => void;
  stderr: (texto: string) => void;
  ejecutarProceso?: EjecutarProceso;
}

interface ArgumentosDelComando {
  salida: string;
  corridas: number;
  coberturaMinima: number;
  sensibilidadMinima: number;
}

const USO =
  'uso: eval:pii [--salida <archivo.json>] [--corridas <n>] [--cobertura-minima <0-1>] [--sensibilidad-minima <0-1>]\n';

function numeroEnRango(texto: string | undefined, minimo: number, maximo: number): number | null {
  const valor = Number(texto);
  return texto !== undefined && Number.isFinite(valor) && valor >= minimo && valor <= maximo
    ? valor
    : null;
}

function leerArgumentos(argumentos: string[], raiz: string): ArgumentosDelComando | null {
  const opciones = new Map<string, string>();
  for (let i = 0; i < argumentos.length; i += 2) {
    const nombre = argumentos[i];
    if (nombre === undefined || !nombre.startsWith('--')) return null;
    const valor = argumentos[i + 1];
    if (valor === undefined) return null;
    opciones.set(nombre, valor);
  }
  const corridas = numeroEnRango(opciones.get('--corridas') ?? `${CORRIDAS_POR_OMISION}`, 1, 100);
  const cobertura = numeroEnRango(
    opciones.get('--cobertura-minima') ?? `${COBERTURA_MINIMA_POR_OMISION}`,
    0,
    1,
  );
  const sensibilidad = numeroEnRango(
    opciones.get('--sensibilidad-minima') ?? `${SENSIBILIDAD_MINIMA_POR_OMISION}`,
    0,
    1,
  );
  if (corridas === null || cobertura === null || sensibilidad === null) return null;
  return {
    salida: path.resolve(raiz, opciones.get('--salida') ?? SALIDA_POR_OMISION),
    corridas: Math.floor(corridas),
    coberturaMinima: cobertura,
    sensibilidadMinima: sensibilidad,
  };
}

function escribirInforme(ruta: string, informe: InformeDePii): void {
  mkdirSync(path.dirname(ruta), { recursive: true });
  writeFileSync(ruta, `${JSON.stringify(informe, null, 2)}\n`, 'utf8');
}

export async function ejecutarComandoPii(
  argumentos: string[],
  dependencias: DependenciasDelComando,
): Promise<number> {
  const { raizDelRepo, entorno } = dependencias;
  const opciones = leerArgumentos(argumentos, raizDelRepo);
  if (opciones === null) {
    dependencias.stderr(USO);
    return SALIDA_USO;
  }
  try {
    const configuracion = cargarConfiguracionDePii(
      readDeidentificationConfig({
        PII_FORMATS_PATH: path.join(raizDelRepo, FORMATOS_POR_OMISION),
        PII_MASKS_PATH: path.join(raizDelRepo, MASCARAS_POR_OMISION),
        ...entorno,
      }),
      (ruta) => readFileSync(ruta, 'utf8'),
    );
    const { textos, tiposDirectos } = await cargarCorpusPiiMini({
      raizDelRepo,
      python: entorno['PII_EVAL_PYTHON'] ?? 'python3',
      rutaDeBinarios: entorno['PATH'] ?? '',
      ...(dependencias.ejecutarProceso === undefined
        ? {}
        : { ejecutar: dependencias.ejecutarProceso }),
    });
    const informe = medirDetectorOpcionA(textos, configuracion, {
      coberturaMinima: opciones.coberturaMinima,
      sensibilidadMinima: opciones.sensibilidadMinima,
      corridas: opciones.corridas,
      reloj: dependencias.reloj,
      tiposDirectos,
    });
    escribirInforme(opciones.salida, informe);
    resumir(informe, dependencias.stdout);
    return SALIDA_OK;
  } catch (error) {
    if (error instanceof ConfiguracionInvalidaError) {
      dependencias.stderr(`configuración inválida: ${error.variable}\n`);
    } else if (error instanceof CorpusInvalidoError) {
      dependencias.stderr(`${error.message}\n`);
    } else {
      dependencias.stderr('la medición de PII falló\n');
    }
    return SALIDA_FALLO;
  }
}

/** Una línea por modo: tipos y cifras agregadas, nunca valores. */
function resumir(informe: InformeDePii, stdout: (texto: string) => void): void {
  for (const [modo, medicion] of Object.entries(informe.modos)) {
    const fp = medicion.falsosPositivosClinicos;
    stdout(
      `${modo}: sensibilidad mínima por tipo directo ${medicion.cumpleSensibilidadMinimaPorTipoDirecto ? 'cumple' : 'no cumple'}` +
        ` (por debajo: ${medicion.tiposDirectosPorDebajo.join(', ') || 'ninguno'});` +
        ` falsos positivos clínicos ${fp.marcados}/${fp.controles};` +
        ` p95 ${medicion.latenciaP95Ms.toFixed(3)} ms\n`,
    );
  }
}
