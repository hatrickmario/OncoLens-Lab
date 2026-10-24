## ADDED Requirements

### Requirement: integration-rag descarga sus imágenes de forma resiliente y distingue la descarga de la salud
El job `integration-rag` MUST ejecutar `compose pull` antes de `compose up --no-build`, con hasta `INTEGRACION_RAG_PULL_INTENTOS` intentos (3) y espera creciente (RN-22), reintentando solo la descarga, nunca Pytest ni la salud. Agotados los intentos, MUST fallar con "integracion-rag: no se pudo descargar la imagen de <servicio>" y SHALL NOT emitir "no quedaron sanos en <n>s", reservado a la espera de salud. `milvus-etcd` MUST usar `gcr.io/etcd-development/etcd:v3.5.34`.

#### Scenario: Un 503 transitorio en la descarga se recupera con un reintento [US-213 AC-13] [S3 resp. 14]
- **GIVEN** el test hermético con un `docker` falso cuyo `compose pull` falla con `503 Service Unavailable` en el primer intento y termina bien en el segundo
- **WHEN** se ejecuta `integracion-rag-orchestrator.sh`
- **THEN** el log registra dos llamadas a `pull` antes de un único `up --no-build`, la espera entre ellas es la configurada y el script continúa hasta Pytest

#### Scenario: La descarga que falla siempre termina con el mensaje de descarga, no con el de salud [US-213 AC-13] [S3 resp. 14]
- **GIVEN** el `docker` falso con `compose pull` que falla con `503` en los 3 intentos para `milvus-etcd`
- **WHEN** se ejecuta el script
- **THEN** termina con código distinto de 0 y "integracion-rag: no se pudo descargar la imagen de milvus-etcd", no aparece "no quedaron sanos" y nunca se llama a `up` ni a Pytest

#### Scenario: Un servicio sin salud tras descargar sigue fallando con el mensaje de salud [US-213 AC-13]
- **GIVEN** el `docker` falso con `pull` correcto y `milvus-standalone` que no queda sano
- **WHEN** se ejecuta el script
- **THEN** termina con "no quedaron sanos en <n>s" nombrando el servicio, sin el mensaje de descarga y sin reintentar el `up`

#### Scenario: Los tests de Pytest no se reintentan [US-213 AC-13]
- **GIVEN** el `docker` falso con `pull` correcto y Pytest en rojo
- **WHEN** se ejecuta el script
- **THEN** Pytest se invoca una sola vez y el job termina en `failure`

#### Scenario: etcd se descarga desde gcr.io con la misma versión [US-213 AC-13] [S3 resp. 14]
- **GIVEN** `infra/docker/docker-compose.yml`
- **WHEN** se resuelve `compose config` del servicio `milvus-etcd`
- **THEN** su imagen es `gcr.io/etcd-development/etcd:v3.5.34`, ninguna imagen del Compose viene de `quay.io` y el *healthcheck* `etcdctl endpoint health` se conserva
