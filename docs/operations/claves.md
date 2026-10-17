# Claves, secretos y certificados

Operación de los secretos del stack local (US-035, SEG-07, SEG-08, RN-14). Este documento **no contiene ningún valor**:
solo nombres, destinos y procedimientos. El repositorio es público; nada de lo que se genera aquí se versiona.

## Qué genera `scripts/setup-secrets.sh`

```bash
scripts/setup-secrets.sh                 # genera lo que falta; lo que existe no se toca
scripts/setup-secrets.sh --profile test  # además, lo del perfil test/CI (abajo)
scripts/setup-secrets.sh --rotate <nombre>
```

Solo necesita `bash` y `openssl` (OpenSSL 3 o LibreSSL 3.3 o posterior). Escribe en `${ONCOLENS_SECRETS_DIR}` o, por
defecto, en `infra/docker/secrets/` (ignorado por git; el script se niega a escribir en una ruta versionada). La salida
solo nombra archivos y estados (`generado`, `rotado`, `existe, sin cambios`), nunca valores. Las subredes, la validez
de los certificados y el prefijo de test salen de `infra/docker/.env` o, si no existe, de `infra/docker/.env.example`.

| Archivo | Qué es | Modo |
|---|---|---|
| `jwt_service_private.pem` · `jwt_service_public.pem` | par EC P-256 del JWT de servicio (ES256) | 0600 · 0644 |
| `identity_aes_key` | clave AES-256 de la identidad (32 bytes, base64) | 0600 |
| `blind_index_hmac_key` | clave HMAC-SHA256 del índice ciego (32 bytes, base64) | 0600 |
| `pg_superuser_password` | contraseña de `postgres`; solo la usa el *entrypoint* de la imagen | 0600 |
| `pg_clinical_api_password` · `pg_research_writer_password` | roles `clinical_api` y `research_writer` | 0600 |
| `pg_rag_corpus_password` | rol `rag_corpus` (runtime del corpus: `USAGE` + DML sobre `corpus`, sin `CREATE`) | 0600 |
| `pg_rag_corpus_migrator_password` | rol `rag_corpus_migrator` (DDL solo sobre `corpus`, para Alembic) | 0600 |
| `clinical_minio_root_password` · `milvus_minio_root_password` | cuentas raíz de los dos MinIO | 0600 |
| `seed_doctor_password` · `seed_admin_password` | cuentas sintéticas del seed (`l1d-169-synthetic-demo-seed`) | 0600 |
| `pg_ca.key` · `pg_ca.crt` | CA propia de PostgreSQL; la clave **no se monta** en ningún servicio; el certificado público lo montan solo `clinical-api` y el *one-shot* `clinical-seed` (`CLINICAL_DATABASE_CA_FILE`) para verificar el TLS | 0600 · 0644 |
| `pg_server.key` · `pg_server.crt` | certificado del servidor, SAN `DNS:postgres`, firmado por la CA | 0600 · 0644 |
| `pg_hba.conf` | reglas de acceso renderizadas desde `infra/docker/postgres/pg_hba.conf.template` | 0644 |
| `pg_test_admin_password` · `pg_hba.test.conf` | solo con `--profile test`: rol `oncolens_test_admin` (solo `CREATEDB`) y las reglas con `PG_TEST_DB_PREFIX` | 0600 · 0644 |

Son dieciocho archivos, veinte con `--profile test`.

## Quién recibe qué

Cada servicio recibe como archivo (`/run/secrets/<nombre>`) solo lo que necesita; ningún valor viaja en `environment:`.
Lo verifica el test estático `infra/docker/__tests__/compose-secrets.test.mjs`.

| Servicio | Secretos |
|---|---|
| `clinical-api` | `jwt_service_private.pem`, `identity_aes_key`, `blind_index_hmac_key`, `pg_clinical_api_password`, `pg_ca.crt`, `pg_research_writer_password`, `clinical_minio_root_password` |
| `rag-orchestrator` | exactamente `jwt_service_public.pem` y `pg_rag_corpus_password` |
| `corpus-migrate` (*one-shot* de L1D-114) | exactamente `pg_rag_corpus_migrator_password` |
| `clinical-seed` (*one-shot* de L1D-169) | `pg_clinical_api_password`, `pg_ca.crt` (verifica el TLS de PostgreSQL), `seed_doctor_password`, `seed_admin_password` |
| `postgres` | las contraseñas de los roles, `pg_server.crt`, `pg_server.key`, `pg_hba.conf` (perfil test: también `pg_hba.test.conf` y `pg_test_admin_password`) |
| `clinical-minio` | `clinical_minio_root_password` |
| `milvus-minio`, `milvus-standalone` | `milvus_minio_root_password` |
| `web`, `milvus-etcd` | ninguno |

`rag-orchestrator` nunca recibe la privada del JWT, las claves de identidad ni credenciales de `clinical-minio`.

### Permisos: los secretos se quedan en 0600

Los permisos de host de los secretos **no se relajan** (ni en el smoke ni en la CI). Cada servicio los lee así:

- `postgres`: su *entrypoint* corre como root, copia la clave TLS y las contraseñas a un tmpfs (`/run/pg-secrets`,
  solo en memoria) propiedad de `postgres` con `0400`, y apunta a esa copia.
- `clinical-api` y `rag-orchestrator`: corren con el uid:gid del dueño de los archivos (`ONCOLENS_UID` y
  `ONCOLENS_GID` en `infra/docker/.env`; valores de `id -u` y `id -g` de quien ejecutó `setup-secrets.sh`; por defecto
  1000:1000). En Linux, si el uid no coincide, el servicio no lee su secreto y no queda `healthy`: el smoke lo detecta.
- `clinical-minio`, `milvus-*`: las imágenes corren como root.

Además, `.dockerignore` excluye `secrets/`, `*.pem`, `*.key`, `pg_hba*.conf` y `.env*` del contexto de construcción:
ningún secreto llega a una capa de imagen.

## Idempotencia y rotación

- Sin `--rotate`, el script no sobrescribe ningún secreto: informa `existe, sin cambios: <nombre>`. `pg_hba.conf` (y
  `pg_hba.test.conf`) no es un secreto: se vuelve a renderizar siempre y solo se reescribe, con `actualizado:`, si
  cambió la configuración (subredes, `POSTGRES_DB`, prefijo de test). Las subredes deben tener un prefijo de `/16` a
  `/32`; una más amplia abriría el `pg_hba` a redes ajenas al stack y el script aborta sin escribir. Si cambia la
  validez de los certificados, reemítelos con `--rotate`.
- `--rotate <nombre>` regenera solo ese archivo y su pareja: el par JWT, el par TLS del servidor (se reemite con la CA
  existente) o la CA (que reemite además el par del servidor, firmado por la CA nueva).
- **`identity_aes_key` y `blind_index_hmac_key` no se rotan desde el script**: se niega con código distinto de 0.
  Rotarlas sin re-cifrar la identidad existente la pierde (riesgo OL-01). La rotación con re-cifrado es Post-MVP.

### Respaldo de las claves de identidad

**Perder `identity_aes_key` es perder la identidad cifrada de todos los pacientes; perder `blind_index_hmac_key`, la
búsqueda exacta por identidad.** Antes de usar el stack con cualquier dato que importe:

1. Copia las dos claves a un respaldo **cifrado y fuera del repositorio** (por ejemplo, un volumen cifrado o un
   gestor de contraseñas), nunca en el árbol de trabajo, en un chat ni en un ticket.
2. Guarda el respaldo en un sitio distinto de la máquina que ejecuta el stack.
3. Comprueba la restauración copiándolas a un directorio temporal y comparando su `sha256sum` con el original.

### Cambiar la contraseña de un rol

Los roles se crean una sola vez, al inicializar el volumen de PostgreSQL (`infra/docker/postgres/initdb/10-roles.sh`).
Regenerar una `pg_*_password` con `--rotate` no cambia la contraseña de una base ya inicializada. Dos caminos:

- datos de desarrollo desechables: `docker compose down -v` y levantar de nuevo (se pierde el volumen);
- conservar los datos: `ALTER ROLE <rol> PASSWORD …` por `local peer` (siguiente apartado), con el valor nuevo
  leído del archivo (`\set pwd `cat …``), nunca escrito en la línea de comandos. Empieza la sesión con
  `SET log_statement = 'none'; SET log_min_error_statement = 'panic';` para que, si la sentencia falla, la contraseña
  no quede en el log del servidor (el *init* de roles hace lo mismo y valida en el shell los límites de conexión).

## Administrar PostgreSQL: solo por `local peer`

No existe ninguna regla de `pg_hba` que admita al superusuario `postgres` por red. La administración se hace dentro del
contenedor:

```bash
docker compose -f infra/docker/docker-compose.yml exec -u postgres postgres psql -U postgres
```

Las demás reglas exigen TLS (`hostnossl … reject` va antes de toda aceptación) y `scram-sha-256`: `clinical_api` y
`research_writer` desde `clinical-net`; `rag_corpus` y `rag_corpus_migrator` solo desde `corpus-db-net` y solo a la base
clínica. `clinical-api` verifica el certificado del servidor contra la CA (`pg_ca.crt`, `CLINICAL_DATABASE_CA_FILE`, `rejectUnauthorized: true`; L1D-197) y no usa `sslmode=require`; los demás clientes usan `sslmode=require` y `verify-full` (distribuir la CA a los clientes) queda para el endurecimiento
del S5/S6 junto con el HTTPS de `web`.

## Perfil test/CI

Los tests de sesión (US-211) necesitan `TEST_DOC1_PASSWORD` y `TEST_DOC2_PASSWORD`, contraseñas **sintéticas** de las
cuentas `doc1`/`doc2` de test. Sin ellas el test falla nombrando la variable. `scripts/test-integration.sh` las genera
en cada ejecución (`SINT-` + aleatorio), solo en el entorno del proceso, sin imprimirlas ni versionarlas; cualquier otro
lanzador (CI) debe definirlas igual o invocar ese script.

`--profile test` añade `pg_test_admin_password` y `pg_hba.test.conf`. Solo los monta
`infra/docker/docker-compose.test.yml`:

```bash
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.test.yml up -d
```

El rol `oncolens_test_admin` solo tiene `CREATEDB`; entra a la base de mantenimiento `postgres` y a las bases cuyo nombre
empieza por `PG_TEST_DB_PREFIX` (por defecto `oltest_`), nunca a la base clínica. El prefijo se valida con
`^[a-z][a-z0-9_]{2,}$` y no puede casar con `POSTGRES_DB`, `postgres` ni `template*`
(`scripts/lib/pg-test-prefix.sh`); los arneses de test de L1D-168 y L1D-114 aplican la misma regla antes de crear su base.

## Qué hacer si algo se filtra

1. Si una clave o contraseña llega a un commit, a un log o a un chat, considérala comprometida: rota el archivo
   afectado (salvo las claves de identidad, que requieren el procedimiento Post-MVP de re-cifrado) y reinicia el stack.
2. Una clave privada o contraseña comprometida **nunca** se resuelve borrando el commit: el historial de un repositorio
   público ya se copió.
3. Los escáneres de secretos de la CI (US-036) cubren el resto.
