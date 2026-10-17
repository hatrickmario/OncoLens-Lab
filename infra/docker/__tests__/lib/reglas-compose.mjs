/**
 * Reglas estáticas sobre el Compose resuelto (`docker compose config --format json`).
 * Cada regla lanza un Error que nombra el servicio infractor; los tests las aplican al Compose real
 * (deben pasar) y a un Compose con un override que rompe la regla (deben fallar nombrando el servicio).
 */

import path from 'node:path';

const SERVICIO_WEB = 'web';
const CLINICAL_API = 'clinical-api';
const RAG = 'rag-orchestrator';
const CLINICAL_MINIO = 'clinical-minio';
const POSTGRES = 'postgres';
const CORPUS_MIGRATE = 'corpus-migrate';
const CLINICAL_SEED = 'clinical-seed';
const NOMBRES_DE_LLM = /ollama|vllm|llama/i;
const CLAVE_PRIVADA_JWT = 'jwt_service_private.pem';
const CLAVE_PUBLICA_JWT = 'jwt_service_public.pem';
const MONTAJE_CATALOGO = /packages\/clinical-catalogs$/;

export const secretosDe = (servicio) => (servicio.secrets ?? []).map((secreto) => secreto.source);
/** Nombre del archivo de cada secreto montado: un alias en el Compose no puede esconder qué archivo se entrega. */
export const archivosDeSecretos = (config, servicio) =>
  secretosDe(servicio).map((fuente) => path.basename(config.secrets?.[fuente]?.file ?? fuente));
export const entorno = (servicio) => servicio.environment ?? {};

export function servicio(config, nombre) {
  const encontrado = config.services?.[nombre];
  if (!encontrado) throw new Error(`el servicio ${nombre} no existe en el Compose`);
  return encontrado;
}

/** SEG-09: solo `web` publica un puerto; los backends tampoco declaran `expose`. */
export function assertSoloWebPublicaPuertos(config) {
  for (const [nombre, definicion] of Object.entries(config.services)) {
    const publicados = definicion.ports ?? [];
    if (nombre === SERVICIO_WEB) {
      if (publicados.length !== 1) throw new Error(`${nombre} debe publicar exactamente un puerto y publica ${publicados.length}`);
    } else if (publicados.length > 0) {
      throw new Error(`${nombre} publica un puerto al host y solo web puede hacerlo (SEG-09)`);
    }
    if ([CLINICAL_API, RAG].includes(nombre) && (definicion.expose ?? []).length > 0) {
      throw new Error(`${nombre} declara expose y los backends no exponen puertos`);
    }
  }
}

/** AC-5: ningún servicio es un LLM y rag-orchestrator lo alcanza por host.docker.internal. */
export function assertSinServicioDeLlm(config) {
  for (const [nombre, definicion] of Object.entries(config.services)) {
    if (NOMBRES_DE_LLM.test(nombre) || NOMBRES_DE_LLM.test(definicion.image ?? '')) {
      throw new Error(`${nombre} es un servicio de LLM y el LLM corre fuera de Docker`);
    }
  }
  const url = entorno(servicio(config, RAG)).LLM_BASE_URL;
  if (!url || new URL(url).hostname !== 'host.docker.internal') {
    throw new Error(`${RAG}: LLM_BASE_URL debe apuntar a host.docker.internal y es ${url}`);
  }
  if (!(servicio(config, RAG).extra_hosts ?? []).some((host) => String(host).startsWith('host.docker.internal'))) {
    throw new Error(`${RAG} debe declarar extra_hosts para host.docker.internal`);
  }
}

/** AC-3: rag-orchestrator con sistema de archivos de solo lectura y TMPDIR en un tmpfs. */
export function assertRagSoloLecturaConTmpfs(config) {
  const rag = servicio(config, RAG);
  if (rag.read_only !== true) throw new Error(`${RAG} debe declarar read_only: true`);
  const tmpfs = Array.isArray(rag.tmpfs) ? rag.tmpfs : Object.keys(rag.tmpfs ?? {});
  if (!tmpfs.some((montaje) => String(montaje).split(':')[0] === '/tmp')) throw new Error(`${RAG} debe montar un tmpfs en /tmp`);
  if (entorno(rag).TMPDIR !== '/tmp') throw new Error(`${RAG} debe fijar TMPDIR=/tmp`);
}

/**
 * Quién puede recibir cada secreto (US-035, design D3). Los servicios one-shot `corpus-migrate` (L1D-114) y
 * `clinical-seed` (L1D-169) aún pueden no existir: la regla solo los exige cuando existen.
 */
export const DUENOS_DE_SECRETOS = {
  [CLAVE_PRIVADA_JWT]: [CLINICAL_API],
  [CLAVE_PUBLICA_JWT]: [RAG],
  identity_aes_key: [CLINICAL_API],
  blind_index_hmac_key: [CLINICAL_API],
  pg_clinical_api_password: [CLINICAL_API, POSTGRES, CLINICAL_SEED],
  pg_research_writer_password: [CLINICAL_API, POSTGRES],
  pg_rag_corpus_password: [RAG, POSTGRES],
  pg_rag_corpus_migrator_password: [CORPUS_MIGRATE, POSTGRES],
  pg_superuser_password: [POSTGRES],
  // La CA vive en el directorio de secretos para reemitir pg_server.crt; ningún servicio la monta.
  'pg_ca.key': [],
  'pg_ca.crt': [],
  'pg_server.crt': [POSTGRES],
  'pg_server.key': [POSTGRES],
  'pg_hba.conf': [POSTGRES],
  'pg_hba.test.conf': [POSTGRES],
  pg_test_admin_password: [POSTGRES],
  seed_doctor_password: [CLINICAL_SEED],
  seed_admin_password: [CLINICAL_SEED],
  clinical_minio_root_password: [CLINICAL_API, CLINICAL_MINIO],
  milvus_minio_root_password: ['milvus-minio', 'milvus-standalone'],
};
const VARIABLES_DE_CLAVE_JWT = { SERVICE_JWT_PRIVATE_KEY_FILE: [CLAVE_PRIVADA_JWT, CLINICAL_API], SERVICE_JWT_PUBLIC_KEY_FILE: [CLAVE_PUBLICA_JWT, RAG] };

/** AC-3: cada backend recibe solo su mitad del par del JWT de servicio y los secretos de identidad solo llegan a clinical-api. */
export function assertClavesPorServicio(config) {
  for (const [nombre, definicion] of Object.entries(config.services)) {
    for (const secreto of archivosDeSecretos(config, definicion)) {
      const duenos = DUENOS_DE_SECRETOS[secreto];
      if (!duenos) throw new Error(`secreto sin dueño declarado: ${secreto} (montado en ${nombre}); declara sus dueños en DUENOS_DE_SECRETOS`);
      if (!duenos.includes(nombre)) throw new Error(`${nombre} recibe el secreto ${secreto} y solo lo recibe ${duenos.join(' o ')}`);
    }
    for (const variable of Object.keys(VARIABLES_DE_CLAVE_JWT)) {
      if (variable in entorno(definicion) && VARIABLES_DE_CLAVE_JWT[variable][1] !== nombre) throw new Error(`${nombre} declara ${variable} y solo lo declara ${VARIABLES_DE_CLAVE_JWT[variable][1]}`);
    }
  }
  for (const [variable, [secreto, nombre]] of Object.entries(VARIABLES_DE_CLAVE_JWT)) {
    const definicion = servicio(config, nombre);
    if (!secretosDe(definicion).includes(secreto)) throw new Error(`${nombre} debe recibir ${secreto}`);
    if (entorno(definicion)[variable] !== `/run/secrets/${secreto}`) throw new Error(`${nombre}: ${variable} debe apuntar a /run/secrets/${secreto}`);
  }
}

/** AC-3: el catálogo clínico se monta de solo lectura en CLINICAL_CATALOG_PATH en ambos backends y no en web. */
export function assertCatalogoSoloLectura(config) {
  for (const nombre of [CLINICAL_API, RAG]) {
    const definicion = servicio(config, nombre);
    const destino = entorno(definicion).CLINICAL_CATALOG_PATH;
    const montaje = (definicion.volumes ?? []).find((volumen) => MONTAJE_CATALOGO.test(volumen.source ?? ''));
    if (!montaje) throw new Error(`${nombre} debe montar packages/clinical-catalogs`);
    if (montaje.read_only !== true) throw new Error(`${nombre} debe montar packages/clinical-catalogs de solo lectura`);
    if (!destino || montaje.target !== destino) throw new Error(`${nombre}: CLINICAL_CATALOG_PATH debe apuntar al destino del montaje (${montaje.target})`);
  }
  const enWeb = (servicio(config, SERVICIO_WEB).volumes ?? []).some((volumen) => MONTAJE_CATALOGO.test(volumen.source ?? ''));
  if (enWeb) throw new Error(`${SERVICIO_WEB} no debe montar packages/clinical-catalogs`);
}

/** AC-3: rag-orchestrator no comparte red con clinical-minio y corpus-db-net es interna. */
export function assertAislamientoDeRedes(config) {
  const redesDe = (nombre) => Object.keys(servicio(config, nombre).networks ?? {});
  const compartidas = redesDe(RAG).filter((red) => redesDe(CLINICAL_MINIO).includes(red));
  if (compartidas.length > 0) throw new Error(`${RAG} comparte red con ${CLINICAL_MINIO}: ${compartidas.join(', ')}`);
  if (config.networks?.['corpus-db-net']?.internal !== true) throw new Error('corpus-db-net debe ser internal: true');
}

/** Un servicio one-shot (migrador) corre y termina: `restart: "no"` y sin healthcheck, que sería ficticio. */
export const esOneShot = (definicion) => definicion.restart === 'no';

/** AC-1: nueve servicios (ocho long-running con healthcheck y el migrador one-shot `corpus-migrate`), imágenes de terceros con tag exacto y clinical-api sin depender de rag-orchestrator. */
export function assertStackCompleto(config) {
  const nombres = Object.keys(config.services).sort();
  const esperados = ['clinical-api', 'clinical-minio', 'corpus-migrate', 'milvus-etcd', 'milvus-minio', 'milvus-standalone', 'postgres', 'rag-orchestrator', 'web'];
  if (JSON.stringify(nombres) !== JSON.stringify(esperados)) throw new Error(`servicios inesperados: ${nombres.join(', ')}`);
  for (const [nombre, definicion] of Object.entries(config.services)) {
    if (!esOneShot(definicion) && !definicion.healthcheck?.test) throw new Error(`${nombre} no declara healthcheck`);
    if (definicion.image && !/:[^:@]+$/.test(definicion.image)) throw new Error(`${nombre}: la imagen ${definicion.image} no fija tag`);
    if (/:latest$/.test(definicion.image ?? '')) throw new Error(`${nombre}: la imagen ${definicion.image} usa latest`);
  }
  if ('rag-orchestrator' in (servicio(config, CLINICAL_API).depends_on ?? {})) {
    throw new Error(`${CLINICAL_API} no debe depender de ${RAG} (el LLM caído no puede tumbar la ficha)`);
  }
}

/** US-054: SERVICE_JWT_TTL_SECONDS tiene un único valor para el firmador (clinical-api) y el verificador (rag-orchestrator). */
export function assertTtlDelJwtCompartido(config) {
  const valores = [CLINICAL_API, RAG].map((nombre) => [nombre, entorno(servicio(config, nombre)).SERVICE_JWT_TTL_SECONDS]);
  for (const [nombre, valor] of valores) {
    if (!valor) throw new Error(`${nombre} debe declarar SERVICE_JWT_TTL_SECONDS`);
  }
  if (valores[0][1] !== valores[1][1]) {
    throw new Error(`${valores[0][0]} (${valores[0][1]}) y ${valores[1][0]} (${valores[1][1]}) deben recibir el mismo SERVICE_JWT_TTL_SECONDS`);
  }
}
