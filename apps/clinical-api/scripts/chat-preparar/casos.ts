import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { parse } from 'yaml';

/**
 * Lectura de `data/eval/chat-v1/casos.yaml` (US-269): solo lo que `clinical-api` necesita para preparar las peticiones.
 * El resto del dataset (guiones del LLM, respuestas esperadas) es de `rag-orchestrator`, que lo valida con
 * `dataset_chat.py`; aquí se ignora.
 */

const EsquemaDeCaso = z.object({
  id: z.string().min(1),
  paciente: z.string().min(1),
  pregunta: z.string().min(1),
  previo: z.string().min(1).optional(),
  hechos_esperados: z.array(z.string()).default([]),
});

/** Un control no nombra paciente: usa el de `PACIENTE_DE_LOS_CONTROLES`. */
const EsquemaDeControl = EsquemaDeCaso.extend({ paciente: z.string().min(1).optional() });

const EsquemaDeFaltantesSembrados = z.object({
  paciente: z.string().min(1),
  items: z.array(
    z.object({
      item: z.string().min(1),
      gap_type: z.enum(['no_encontrado', 'incompleto', 'por_conciliar', 'no_buscado']),
    }),
  ),
});

const EsquemaDeCasos = z.object({
  faltantes_sembrados: z.array(EsquemaDeFaltantesSembrados),
  casos: z.array(EsquemaDeCaso).min(1),
  controles: z.array(EsquemaDeControl).default([]),
});

export type CasoDeChat = z.infer<typeof EsquemaDeCaso>;
export type FaltantesSembrados = z.infer<typeof EsquemaDeFaltantesSembrados>;
export type TipoDeVacio = FaltantesSembrados['items'][number]['gap_type'];

export interface ConjuntoDeCasos {
  faltantesSembrados: FaltantesSembrados[];
  /** Casos y luego controles, en el orden del archivo. */
  casos: CasoDeChat[];
}

/** El paciente de un control, que el dataset no nombra: el de mama de las historias (a) del seed. */
export const PACIENTE_DE_LOS_CONTROLES = 'paciente-a';

export function leerCasosDeChat(directorioDelDataset: string): ConjuntoDeCasos {
  const crudo = parse(readFileSync(join(directorioDelDataset, 'casos.yaml'), 'utf8')) as unknown;
  const { faltantes_sembrados, casos, controles } = EsquemaDeCasos.parse(crudo);
  return {
    faltantesSembrados: faltantes_sembrados,
    casos: [
      ...casos,
      ...controles.map((control) => ({
        ...control,
        paciente: control.paciente ?? PACIENTE_DE_LOS_CONTROLES,
      })),
    ],
  };
}
