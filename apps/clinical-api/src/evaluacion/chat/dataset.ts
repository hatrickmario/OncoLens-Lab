import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import type { CasoParaPreparar } from './preparar-peticiones.js';

/** Dataset `chat-v1` relativo a la raíz del repositorio. */
const RUTA_DEL_DATASET = path.join('data', 'eval', 'chat-v1', 'casos.yaml');

/** El dataset no tiene la forma que la preparación necesita; el mensaje nombra el caso y el campo, nunca un valor. */
export class DatasetDeChatInvalidoError extends Error {
  constructor(motivo: string) {
    super(`dataset chat-v1 inválido: ${motivo}`);
    this.name = 'DatasetDeChatInvalidoError';
  }
}

type Fila = Record<string, unknown>;

const esFila = (valor: unknown): valor is Fila =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

function texto(fila: Fila, campo: string, id: string): string {
  const valor = fila[campo];
  if (typeof valor !== 'string' || valor === '') {
    throw new DatasetDeChatInvalidoError(`${id}: falta ${campo}`);
  }
  return valor;
}

function filas(documento: Fila, campo: string): Fila[] {
  const valor = documento[campo] ?? [];
  if (!Array.isArray(valor) || !valor.every(esFila)) {
    throw new DatasetDeChatInvalidoError(`${campo} no es una lista de casos`);
  }
  return valor as Fila[];
}

function hechosEsperados(caso: Fila, id: string): string[] {
  const valor = caso['hechos_esperados'] ?? [];
  if (!Array.isArray(valor) || !valor.every((clave) => typeof clave === 'string')) {
    throw new DatasetDeChatInvalidoError(`${id}: hechos_esperados no es una lista de claves`);
  }
  return valor as string[];
}

function casoParaPreparar(caso: Fila, paciente: string | null): CasoParaPreparar {
  const id = typeof caso['id'] === 'string' ? caso['id'] : '(sin id)';
  return {
    id: texto(caso, 'id', id),
    cancer: texto(caso, 'cancer', id),
    paciente: paciente ?? texto(caso, 'paciente', id),
    pregunta: texto(caso, 'pregunta', id),
    hechosEsperados: hechosEsperados(caso, id),
  };
}

/**
 * Casos y controles de `chat-v1` para preparar. Los controles no nombran paciente: toman el del primer caso del mismo
 * tipo de cáncer, porque la petición solo necesita un paciente sembrado de ese tipo (D6-51 no se mide aquí).
 */
export function cargarCasosDelChat(
  raizDelRepo: string,
  leer: (ruta: string) => string = (ruta) => readFileSync(ruta, 'utf8'),
): CasoParaPreparar[] {
  const documento: unknown = parse(leer(path.join(raizDelRepo, RUTA_DEL_DATASET)));
  if (!esFila(documento)) throw new DatasetDeChatInvalidoError('el documento no es un mapa');
  const casos = filas(documento, 'casos').map((caso) => casoParaPreparar(caso, null));
  const controles = filas(documento, 'controles').map((control) => {
    const cancer = texto(control, 'cancer', String(control['id']));
    const paciente = casos.find((caso) => caso.cancer === cancer)?.paciente;
    if (paciente === undefined) {
      throw new DatasetDeChatInvalidoError(`${String(control['id'])}: sin caso de ${cancer}`);
    }
    return casoParaPreparar(control, paciente);
  });
  return [...casos, ...controles];
}
