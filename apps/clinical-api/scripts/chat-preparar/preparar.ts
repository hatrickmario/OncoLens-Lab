import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Express } from 'express';
import type { Client } from 'pg';
import respuestaDeCaso from '../../../../contracts/examples/chat-turn-caso-ok.json' with { type: 'json' };
import { idSembrado } from '../../prisma/seed/determinismo.js';
import { PACIENTE_CHAT } from '../../prisma/seed/pacientes/chat.js';
import { lectorDeIdentidadFalso } from '../../tests/support/desidentificacion.js';
import {
  IDENTIDAD_CHAT,
  abrirConversacion,
  enviarTurno,
} from '../../tests/support/conversacion.js';
import {
  montarGateway,
  type MundoDeGateway,
  type RagSimulado,
} from '../../tests/support/gateway.js';
import { leerCasosDeChat, type CasoDeChat, type ConjuntoDeCasos } from './casos.js';
import { resolverMarcadorDeIdentidad } from './identidad-sintetica.js';
import {
  medirFaltantes,
  type ItemEnviado,
  type MetricasDeFaltantes,
} from './metricas-faltantes.js';

export type { MetricasDeFaltantes } from './metricas-faltantes.js';

export interface EntradaDeLaPreparacion {
  mundo: MundoDeGateway;
  rag: RagSimulado;
  cookie: string;
  /** Directorio del dataset `chat-v1` (`manifest.yaml` y `casos.yaml`). */
  dataset: string;
  /** Directorio donde se escriben las peticiones (`<id-del-caso>.json`). */
  salida: string;
}

export interface ResultadoDeLaPreparacion {
  /** Ids de los casos y controles para los que se escribió una petición. */
  peticiones: string[];
  /** Por clave de paciente del seed. */
  faltantes: Record<string, MetricasDeFaltantes>;
}

type Cuerpo = Record<string, unknown>;

/** Lo que se sabe de un paciente tras un turno de sondeo: sus hechos por recurso y el checklist que se envió. */
interface SondeoDelPaciente {
  factRefPorRecurso: ReadonlyMap<string, string>;
  hechos: number;
  completeness: readonly ItemEnviado[];
}

const PREGUNTA_DE_SONDEO = '¿Cuál es la situación actual del paciente?';

/** El turno que Backend 2 «responde» en la preparación: solo cita hechos, lo justo para que el turno se persista. */
function respuestaQueCita(factRefs: readonly string[]): Cuerpo {
  return {
    ...respuestaDeCaso,
    blocks: [{ kind: 'documentado', text: 'Datos documentados del caso', factRefs }],
  };
}

function lectorDeIdentidadDelSeed() {
  return lectorDeIdentidadFalso({ [idSembrado(PACIENTE_CHAT)]: IDENTIDAD_CHAT });
}

interface TurnoEnviado {
  peticion: Cuerpo;
  dataLinks: { factRef: string; resourceId: string }[];
}

/** Abre una conversación nueva, envía un turno por la API real y devuelve lo que viajó a `/chat/turn` y los enlaces. */
async function enviarTurnoDeLaPreparacion(
  entrada: EntradaDeLaPreparacion,
  app: Express,
  paciente: string,
  pregunta: string,
  respuesta: Cuerpo,
): Promise<TurnoEnviado> {
  const { rag, cookie } = entrada;
  const patientId = idSembrado(paciente);
  const conversationId = await abrirConversacion(app, cookie, patientId);
  rag.chat.responder({ tipo: 'json', status: 200, cuerpo: respuesta });
  const previas = rag.chat.llamadas();
  const turno = await enviarTurno(app, cookie, conversationId, pregunta);
  const capturada = rag.chat.capturadas[previas];
  if (turno.status !== 201 || capturada === undefined) {
    throw new Error(`el turno de preparación de ${paciente} respondió ${turno.status}`);
  }
  return {
    peticion: capturada.cuerpo,
    dataLinks: (turno.body as { dataLinks: TurnoEnviado['dataLinks'] }).dataLinks,
  };
}

/** Dos turnos de sondeo: el primero fija cuántos hechos hay; el segundo los cita todos y devuelve su enlace al recurso. */
async function sondearPaciente(
  entrada: EntradaDeLaPreparacion,
  app: Express,
  paciente: string,
): Promise<SondeoDelPaciente> {
  const primero = await enviarTurnoDeLaPreparacion(
    entrada,
    app,
    paciente,
    PREGUNTA_DE_SONDEO,
    respuestaQueCita(['f1']),
  );
  const hechos = (primero.peticion['caseFacts'] as unknown[]).length;
  const todos = Array.from({ length: hechos }, (_, i) => `f${i + 1}`);
  const segundo = await enviarTurnoDeLaPreparacion(
    entrada,
    app,
    paciente,
    PREGUNTA_DE_SONDEO,
    respuestaQueCita(todos),
  );
  return {
    hechos,
    completeness: primero.peticion['completeness'] as ItemEnviado[],
    factRefPorRecurso: new Map(segundo.dataLinks.map((e) => [e.resourceId, e.factRef])),
  };
}

/**
 * Ids de recurso que una clave del seed (`<paciente>/<recurso>`) puede nombrar: el recurso mismo, los biomarcadores de un
 * examen con esa clave, o el biomarcador con ese nombre (`paciente-a/her2`).
 */
async function recursosDeLaClave(cliente: Client, clave: string): Promise<string[]> {
  const [paciente = '', ...resto] = clave.split('/');
  const delExamen = await cliente.query<{ id: string }>(
    'SELECT id FROM clinical.biomarker WHERE exam_id = $1',
    [idSembrado(clave)],
  );
  const porNombre = await cliente.query<{ id: string }>(
    `SELECT b.id FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id
      WHERE e.patient_id = $1 AND lower(replace(b.name, ' ', '-')) = $2`,
    [idSembrado(paciente), resto.join('/')],
  );
  return [
    idSembrado(clave),
    ...delExamen.rows.map((f) => f.id),
    ...porNombre.rows.map((f) => f.id),
  ];
}

/** `clave del seed → factRef` de cada hecho esperado del caso; una clave sin hecho en el turno es un error del dataset. */
async function traducirHechosEsperados(
  cliente: Client,
  caso: CasoDeChat,
  sondeo: SondeoDelPaciente,
): Promise<Record<string, string>> {
  const traducidos: Record<string, string> = {};
  for (const clave of caso.hechos_esperados) {
    const recursos = await recursosDeLaClave(cliente, clave);
    const factRef = recursos.map((id) => sondeo.factRefPorRecurso.get(id)).find((f) => f);
    if (factRef === undefined) {
      throw new Error(`${caso.id}: la clave ${clave} no corresponde a ningún hecho del turno`);
    }
    traducidos[clave] = factRef;
  }
  return traducidos;
}

function escribirPeticion(
  salida: string,
  caso: CasoDeChat,
  contenido: { peticion: Cuerpo; hechosPorClave: Record<string, string>; identidad: string[] },
): void {
  writeFileSync(join(salida, `${caso.id}.json`), `${JSON.stringify(contenido, null, 2)}\n`);
}

/** Un caso que continúa el hilo de otro no lleva la rehidratación: solo el primer turno de un hilo la trae. */
function sinRehidratacionSiContinuaElHilo(caso: CasoDeChat, peticion: Cuerpo): Cuerpo {
  if (caso.previo === undefined) return peticion;
  const { rehydration: _rehidratacion, ...resto } = peticion;
  return resto;
}

async function prepararCaso(
  entrada: EntradaDeLaPreparacion,
  app: Express,
  caso: CasoDeChat,
  sondeo: SondeoDelPaciente,
): Promise<void> {
  const { pregunta, identidad } = resolverMarcadorDeIdentidad(caso.pregunta);
  const { peticion } = await enviarTurnoDeLaPreparacion(
    entrada,
    app,
    caso.paciente,
    pregunta,
    respuestaQueCita(['f1']),
  );
  if ((peticion['caseFacts'] as unknown[]).length !== sondeo.hechos) {
    throw new Error(`${caso.id}: los hechos del turno no coinciden con los del sondeo`);
  }
  escribirPeticion(entrada.salida, caso, {
    peticion: sinRehidratacionSiContinuaElHilo(caso, peticion),
    hechosPorClave: await traducirHechosEsperados(entrada.mundo.cliente, caso, sondeo),
    identidad,
  });
}

function pacientesDelConjunto(conjunto: ConjuntoDeCasos): string[] {
  return [
    ...new Set([
      ...conjunto.casos.map((c) => c.paciente),
      ...conjunto.faltantesSembrados.map((f) => f.paciente),
    ]),
  ];
}

/**
 * Paso de `clinical-api` de la suite `evaluate` del chat (US-269): carga cada caso con el pipeline de producción (la API
 * real del gateway sobre el seed de la BD de test, con `rag-orchestrator` simulado que captura lo que le llega), escribe
 * una petición desidentificada por caso y control, y mide los faltantes sembrados contra el `completeness[]` enviado.
 */
export async function prepararPeticionesDeChat(
  entrada: EntradaDeLaPreparacion,
): Promise<ResultadoDeLaPreparacion> {
  const conjunto = leerCasosDeChat(entrada.dataset);
  const { app } = await montarGateway(entrada.mundo, { identidades: lectorDeIdentidadDelSeed() });
  mkdirSync(entrada.salida, { recursive: true });
  const sondeos = new Map<string, SondeoDelPaciente>();
  for (const paciente of pacientesDelConjunto(conjunto)) {
    sondeos.set(paciente, await sondearPaciente(entrada, app, paciente));
  }
  for (const caso of conjunto.casos) {
    await prepararCaso(entrada, app, caso, sondeos.get(caso.paciente) as SondeoDelPaciente);
  }
  return {
    peticiones: conjunto.casos.map((caso) => caso.id),
    faltantes: Object.fromEntries(
      conjunto.faltantesSembrados.map(({ paciente, items }) => [
        paciente,
        medirFaltantes(items, (sondeos.get(paciente) as SondeoDelPaciente).completeness),
      ]),
    ),
  };
}
