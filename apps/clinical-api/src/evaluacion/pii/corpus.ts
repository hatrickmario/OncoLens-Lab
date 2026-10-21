import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { TextoSembrado } from './medicion.js';

/**
 * Carga de `data/eval/pii-mini` (sintético, RN-13): el generador versionado lo materializa EN MEMORIA y lo entrega por
 * la salida estándar de un proceso hijo. Los valores de PII sembrada nunca se escriben en disco ni se versionan.
 */

const DIRECTORIO_DEL_DATASET = path.join('data', 'eval', 'pii-mini');
const MAXIMO_DE_SALIDA_EN_BYTES = 64 * 1024 * 1024;
const TIEMPO_MAXIMO_DEL_GENERADOR_MS = 60_000;

/** Importa `generar.py`, comprueba clase y huellas del manifiesto y vuelca el corpus a stdout. */
const PROGRAMA_DEL_GENERADOR = `
import importlib.util, json, sys
from pathlib import Path
directorio = Path(sys.argv[1])
manifiesto = json.loads((directorio / "manifest.json").read_text(encoding="utf-8"))
if manifiesto.get("clase") != "sintetico":
    sys.exit(2)
especificacion = importlib.util.spec_from_file_location("pii_mini_generar", directorio / "generar.py")
generador = importlib.util.module_from_spec(especificacion)
especificacion.loader.exec_module(generador)
corpus = generador.materializar(manifiesto["semilla"], manifiesto["identidades"], directorio)
if (generador.huella(corpus) != manifiesto["sha256_corpus"]
        or generador.huella_de_plantillas(directorio) != manifiesto["sha256_plantillas"]):
    sys.exit(3)
json.dump(corpus, sys.stdout, ensure_ascii=False)
`;

const esquemaDelCorpus = z.array(
  z.object({
    id: z.string(),
    contexto: z.string(),
    texto: z.string(),
    etiquetas: z.array(z.object({ inicio: z.number(), fin: z.number(), tipo: z.string() })),
    controles: z.array(z.object({ termino: z.string(), critico: z.boolean() })),
  }),
);

export class CorpusInvalidoError extends Error {
  constructor(motivo: string) {
    super(`pii-mini no se pudo cargar: ${motivo}`);
    this.name = 'CorpusInvalidoError';
  }
}

export type EjecutarProceso = (
  programa: string,
  argumentos: string[],
) => Promise<{ stdout: string }>;

const ejecutarConExecFile: EjecutarProceso = async (programa, argumentos) =>
  promisify(execFile)(programa, argumentos, {
    maxBuffer: MAXIMO_DE_SALIDA_EN_BYTES,
    timeout: TIEMPO_MAXIMO_DEL_GENERADOR_MS,
    encoding: 'utf8',
  });

export interface OpcionesDeCorpus {
  raizDelRepo: string;
  /** `PII_EVAL_PYTHON`: intérprete de Python 3 (solo biblioteca estándar). */
  python: string;
  ejecutar?: EjecutarProceso;
}

export async function cargarCorpusPiiMini(opciones: OpcionesDeCorpus): Promise<TextoSembrado[]> {
  const ejecutar = opciones.ejecutar ?? ejecutarConExecFile;
  let salida: string;
  try {
    // `-I`: aislado; no carga código del directorio actual ni del entorno.
    ({ stdout: salida } = await ejecutar(opciones.python, [
      '-I',
      '-c',
      PROGRAMA_DEL_GENERADOR,
      path.join(opciones.raizDelRepo, DIRECTORIO_DEL_DATASET),
    ]));
  } catch {
    // El error del proceso podría arrastrar fragmentos del corpus: no se propaga su mensaje.
    throw new CorpusInvalidoError(
      'el generador falló o las huellas no coinciden con el manifiesto',
    );
  }
  const corpus = esquemaDelCorpus.safeParse(JSON.parse(salida));
  if (!corpus.success)
    throw new CorpusInvalidoError('la salida del generador no cumple el esquema');
  return corpus.data;
}
