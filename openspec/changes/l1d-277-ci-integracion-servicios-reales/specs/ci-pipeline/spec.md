## ADDED Requirements

### Requirement: La integración de clinical-api corre en cada PR y bloquea
El job `integration` MUST ejecutar todos los tests de integración de `clinical-api` contra el PostgreSQL de test del Compose en cada PR y MUST figurar en `needs` de `ci-ok`.

#### Scenario: El job integration corre los tests de clinical-api en verde en main [ARR-01 AC-1]
- **GIVEN** un PR sobre `main`
- **WHEN** corre la CI
- **THEN** el job `integration` ejecuta la suite de integración de `clinical-api` contra el PostgreSQL de test, termina en verde con el número de tests ejecutados impreso y `ci-ok` depende de él

### Requirement: Los tests servicios_reales de rag-orchestrator corren en la CI
La CI MUST tener un job `integration-rag`, incluido en `needs` de `ci-ok`, que ejecute `pytest -m servicios_reales` de `rag-orchestrator` dentro de las redes `corpus-db-net` y `ai-net` del Compose contra el PostgreSQL de test y el Milvus de test, con secretos ficticios y modelos fingidos, sin publicar puertos de esos servicios al host y sin reintentos.

#### Scenario: Milvus, catálogo, release, scripts y semilla pasan con servicios reales [ARR-01 AC-2]
- **GIVEN** un PR y el Compose de test con PostgreSQL y Milvus
- **WHEN** corre el job `integration-rag`
- **THEN** se ejecutan los 23 casos de Milvus de L1D-106 y los de catálogo, *release*, scripts y carga de semilla, todos en verde, y ningún servicio del Compose publica puerto al host

#### Scenario: Un fallo de un test con servicios reales deja en rojo ci-ok [ARR-01 AC-2]
- **GIVEN** un test `servicios_reales` que falla
- **WHEN** corre la CI
- **THEN** `integration-rag` termina en `failure` y `ci-ok` también, nombrando el job

#### Scenario: El contenedor de Pytest no recibe credenciales clínicas [ARR-01 AC-2] (asumido) [RN-10]
- **GIVEN** el job `integration-rag` en ejecución
- **WHEN** se inspeccionan los secretos y variables del contenedor de Pytest
- **THEN** solo contiene las credenciales de `rag_corpus`, las de Milvus de test y la clave pública fingida del JWT de servicio, y ninguna credencial de `clinical`, de cifrado de identidad ni de `clinical-minio`

#### Scenario: Milvus no disponible hace fallar el job en lugar de omitir los tests [ARR-01 AC-2] (asumido)
- **GIVEN** que `milvus-standalone` no queda sano dentro del tiempo de espera
- **WHEN** corre el job `integration-rag`
- **THEN** termina en `failure` nombrando el servicio, sin ejecutar Pytest con tests omitidos

### Requirement: Cada AC de US-058 y US-059 tiene un test ejecutado en la CI
El job `integration-rag` MUST imprimir, por cada test con `@pytest.mark.ac`, su AC y su resultado, de modo que todo AC de US-058 y US-059 tenga al menos un test ejecutado en verde.

#### Scenario: Los siete AC sin ejecución quedan en verde [ARR-01 AC-3]
- **GIVEN** US-058 AC-1, AC-3, AC-4 y US-059 AC-1, AC-3, AC-4, AC-5
- **WHEN** corre el job `integration-rag`
- **THEN** el resumen lista al menos un test ejecutado y en verde para cada uno de esos siete AC

### Requirement: El caso ac2-cited-sources-build se activa con el archivo de L1D-140
Cuando `l1d-140-panel-opcion-citas` se archive, el caso de PR `ac2-cited-sources-build` de L1D-166 MUST dejar de estar pendiente y ejecutarse con el build de `web` en la CI.

#### Scenario: El build de web rompe al eliminar citedSources tras archivar L1D-140 [ARR-01 AC-4]
- **GIVEN** `l1d-140-panel-opcion-citas` archivado y el caso `ac2-cited-sources-build` activo
- **WHEN** se ejecuta el caso en la CI
- **THEN** el build de `web` falla al compilar contra el tipo regenerado sin `citedSources`, como exige el caso
