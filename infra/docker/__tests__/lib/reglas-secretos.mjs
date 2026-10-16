/**
 * Reglas estáticas de US-035 sobre el Compose resuelto (`docker compose config --format json`): reparto de secretos
 * por servicio, ningún valor secreto en `environment` y PostgreSQL con TLS y subredes fijas. Cada regla lanza un Error
 * que nombra el servicio y el secreto infractores. La tabla de dueños vive en reglas-compose.mjs (una sola fuente).
 */
import path from 'node:path';
import { archivosDeSecretos, assertClavesPorServicio, entorno, servicio } from './reglas-compose.mjs';

/** Servicios que reciben exactamente estos secretos (design D3). Los one-shot solo se exigen si existen. */
const SECRETOS_EXACTOS = {
  'rag-orchestrator': ['jwt_service_public.pem', 'pg_rag_corpus_password'],
  web: [],
  'milvus-etcd': [],
};
const SECRETOS_EXACTOS_SI_EXISTE = {
  'corpus-migrate': ['pg_rag_corpus_migrator_password'],
  'clinical-seed': ['pg_clinical_api_password', 'seed_doctor_password', 'seed_admin_password'],
};
const VARIABLE_CON_VALOR_SECRETO = /(PASSWORD|SECRET|PRIVATE_KEY|_KEY)$/;
const CIDR_IPV4 = /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/;

const mismoConjunto = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

function assertSecretosExactosDe(config, nombre, esperados) {
  const montados = archivosDeSecretos(config, servicio(config, nombre));
  const sobrantes = montados.filter((secreto) => !esperados.includes(secreto));
  if (sobrantes.length > 0) {
    throw new Error(`${nombre} recibe el secreto ${sobrantes[0]} y solo debe recibir: ${esperados.join(', ') || 'ninguno'}`);
  }
  if (!mismoConjunto(montados, esperados)) {
    throw new Error(`${nombre} debe recibir exactamente ${esperados.join(', ') || 'ningún secreto'} y recibe ${montados.join(', ') || 'ninguno'}`);
  }
}

/** AC-2: ningún servicio monta como volumen el directorio de secretos (saltaría el reparto por `secrets:`). */
export function assertSinMontajesDelDirectorioDeSecretos(config) {
  const directorios = new Set(Object.values(config.secrets ?? {}).map((secreto) => path.dirname(secreto.file)));
  for (const [nombre, definicion] of Object.entries(config.services)) {
    for (const volumen of definicion.volumes ?? []) {
      const origen = volumen.source ?? '';
      if ([...directorios].some((directorio) => origen === directorio || origen.startsWith(`${directorio}/`))) {
        throw new Error(`${nombre} monta el directorio de secretos (${path.basename(origen) || origen}) como volumen; los secretos se entregan solo por secrets:`);
      }
    }
  }
}

/** AC-2: dueños de cada secreto, directorio de secretos sin montar y conjuntos exactos de rag-orchestrator, web y los one-shot. */
export function assertRepartoDeSecretos(config) {
  assertClavesPorServicio(config);
  assertSinMontajesDelDirectorioDeSecretos(config);
  for (const [nombre, esperados] of Object.entries(SECRETOS_EXACTOS)) assertSecretosExactosDe(config, nombre, esperados);
  for (const [nombre, esperados] of Object.entries(SECRETOS_EXACTOS_SI_EXISTE)) {
    if (config.services[nombre]) assertSecretosExactosDe(config, nombre, esperados);
  }
}

/** AC-2: los secretos son archivos (`*_FILE`); ningún valor secreto viaja en `environment`. */
export function assertSinSecretosEnEntorno(config) {
  for (const [nombre, definicion] of Object.entries(config.services)) {
    for (const variable of Object.keys(entorno(definicion))) {
      if (VARIABLE_CON_VALOR_SECRETO.test(variable)) {
        throw new Error(`${nombre} declara ${variable} con un valor en environment; los secretos se entregan por ${variable}_FILE`);
      }
    }
  }
}

/** AC-4: postgres arranca con ssl=on y el pg_hba.conf montado, y las redes de pg_hba.conf tienen subred fija. */
export function assertPostgresConTls(config) {
  const comando = (servicio(config, 'postgres').command ?? []).join(' ');
  if (!/-c ssl=on/.test(comando)) throw new Error('postgres debe arrancar con ssl=on');
  if (!/-c hba_file=\/run\/secrets\/pg_hba\.conf/.test(comando)) throw new Error('postgres debe arrancar con el pg_hba.conf generado como hba_file');
  for (const red of ['clinical-net', 'corpus-db-net']) {
    const subred = config.networks?.[red]?.ipam?.config?.[0]?.subnet;
    if (!subred || !CIDR_IPV4.test(subred)) throw new Error(`${red} debe fijar su subred desde configuración y es ${subred}`);
  }
}
