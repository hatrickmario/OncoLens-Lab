/**
 * Reglas estáticas de US-035 sobre el Compose resuelto (`docker compose config --format json`): reparto de secretos
 * por servicio, ningún valor secreto en `environment` y PostgreSQL con TLS y subredes fijas. Cada regla lanza un Error
 * que nombra el servicio y el secreto infractores. La tabla de dueños vive en reglas-compose.mjs (una sola fuente).
 */
import path from 'node:path';
import { archivosDeSecretos, assertClavesPorServicio, entorno, servicio } from './reglas-compose.mjs';

/** Servicios que reciben exactamente estos secretos (design D3). Los one-shot solo se exigen si existen. */
const SECRETOS_EXACTOS = {
  // One-shot del seed (L1D-169): contraseña del rol, CA pública para verificar el TLS, las dos del seed y, desde US-046
  // AC-6, las dos claves de la identidad cifrada (siembra con IdentityService). Nada más.
  'clinical-seed': [
    'pg_clinical_api_password',
    'pg_ca.crt',
    'seed_doctor_password',
    'seed_admin_password',
    'identity_aes_key',
    'blind_index_hmac_key',
  ],
  'rag-orchestrator': ['jwt_service_public.pem', 'pg_rag_corpus_password'],
  web: [],
  'milvus-etcd': [],
};
const SECRETOS_EXACTOS_SI_EXISTE = {
  'corpus-migrate': ['pg_rag_corpus_migrator_password'],
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

/**
 * AC-2: los permisos 0600 de los secretos no se relajan; los servicios que leen archivos de secretos con el usuario de
 * la aplicación corren con el uid:gid dueño de esos archivos (ONCOLENS_UID, ONCOLENS_GID), no con uno ajeno.
 */
export function assertAppsConUsuarioDeLosSecretos(config) {
  const usuarios = ['clinical-api', 'rag-orchestrator'].map((nombre) => [nombre, String(servicio(config, nombre).user ?? '')]);
  for (const [nombre, usuario] of usuarios) {
    if (!/^\d+:\d+$/.test(usuario)) throw new Error(`${nombre} debe ejecutarse con ONCOLENS_UID:ONCOLENS_GID y declara user=${usuario || 'ninguno'}`);
  }
  const distintos = new Set(usuarios.map(([, usuario]) => usuario));
  if (distintos.size > 1) throw new Error(`${usuarios.map(([nombre, usuario]) => `${nombre}=${usuario}`).join(' y ')} deben ejecutarse con el mismo usuario dueño de los secretos`);
}

const SECRETOS_DE_CLINICAL = [
  'pg_clinical_api_password',
  'pg_research_writer_password',
  'pg_superuser_password',
  'clinical_minio_root_password',
  'identity_aes_key',
  'blind_index_hmac_key',
  'jwt_service_private.pem',
];
const VARIABLE_DE_CLINICAL = /CLINICAL_API|CLINICAL_DATABASE|PG_CLINICAL|RESEARCH_WRITER|MINIO/i;
const VALOR_DE_CLINICAL = /clinical[-_]minio|clinical_api|research_writer/i;

/**
 * US-040 AC-5 (OL-01, RN-10): el servicio rag-orchestrator resuelto no contiene credenciales ni destinos del rol
 * clinical_api, de research_writer ni de clinical-minio: ni secretos montados (se compara el archivo, no el alias), ni
 * variables de entorno, ni valores (URLs con ese usuario o ese host).
 */
export function assertRagSinCredencialesClinicas(config) {
  const rag = servicio(config, 'rag-orchestrator');
  const ajeno = archivosDeSecretos(config, rag).find((archivo) => SECRETOS_DE_CLINICAL.includes(archivo));
  if (ajeno) throw new Error(`rag-orchestrator monta el secreto ${ajeno}, que es de clinical-api o de clinical-minio`);
  for (const [variable, valor] of Object.entries(entorno(rag))) {
    if (VARIABLE_DE_CLINICAL.test(variable)) throw new Error(`rag-orchestrator declara ${variable}, que es de clinical-api o de clinical-minio`);
    if (VALOR_DE_CLINICAL.test(String(valor))) throw new Error(`rag-orchestrator declara ${variable} con una credencial o un destino de clinical-api o de clinical-minio`);
  }
}
