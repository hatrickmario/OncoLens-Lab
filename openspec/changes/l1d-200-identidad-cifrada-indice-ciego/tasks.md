# Tasks — l1d-200-identidad-cifrada-indice-ciego

## 1. contratos

- [ ] 1.1 (exento: sin cambio de spec) Confirmar que `ErrorInterno` y `error-interno.json` existen en `apps/clinical-api/openapi.yaml` y `contracts/examples/`; sin editar el spec ni `info.version`.

## 2. clinical-platform

- [ ] 2.1 (test después: configuración) `config.ts` con `IDENTITY_KEY_VERSION` e `IDENTITY_AES_KEY_V<n>_FILE` opcionales; `scripts/setup-secrets.sh` genera la clave de la versión activa; claves listadas en el PR para `infra/docker/.env.example` (no se edita aquí). Test de humo de arranque sin la clave activa [US-046 AC-5].
- [ ] 2.2 (TDD estricto) Tests de aceptación en rojo: "el SQL crudo no contiene 52123456 ni Rondón, key_version = 1 y IdentityService descifra los originales [US-046 AC-1]" (integración, PostgreSQL real) y "dos índices del mismo documento son iguales, el de otro número distinto y ninguno contiene el número [US-046 AC-2]" (unitario). Esqueletos de `IdentityService`, `CifradorDeCampos` e `IndiceCiego`. Commit `test(L1D-200)`.
- [ ] 2.3 (TDD estricto) Implementar `cifrador-aes-gcm.ts`, `indice-ciego.ts`, `anillo-de-claves.ts`, `identity.{service,repository}.ts`; extraer `normalizarNumeroDeDocumento()` y `aadDeCampo()` con unitarios uno a uno (nonce inyectado en los unitarios); el HMAC del documento excluye `issuing_country` (D2), con unitario "el país emisor no cambia el índice". Commit `feat(L1D-200)`.
- [ ] 2.4 (TDD estricto) Test de aceptación en rojo: "una identidad v1 y una v2 nueva se descifran ambas cuando IDENTITY_KEY_VERSION = 2 [US-046 AC-5]". Commit `test(L1D-200)`; implementación en `feat(L1D-200)`.
- [ ] 2.5 (TDD estricto) Test de aceptación en rojo: "un byte alterado da 500 ErrorInterno sin datos del paciente y el log solo registra IDENTITY_INTEGRITY_ERROR [US-046 AC-3]" · Supertest sobre la app compuesta en el test con una ruta del propio test que descifra (sin `vi.mock`), respuesta validada contra el spec; la verificación por la ficha queda como regresión en `l1d-72-ficha-minima-paciente`. Commit `test(L1D-200)`.
- [ ] 2.6 (TDD estricto) Implementar `IdentityIntegrityError` y su mapeo en `manejadorFinalDeErrores`. Commit `feat(L1D-200)`.
- [ ] 2.7 (TDD estricto) Test de aceptación en rojo: "registrar y analizar FX-T4a-a no deja 52123456, Lucía, Rondón, lucia fernanda rondon pena ni los valores de national_id_hmac/full_name_hmac en logs, audit, research, ai_analysis_record ni en el payload hacia rag-orchestrator [US-046 AC-4]" · Supertest + PostgreSQL real + MSW que captura el payload (logs de `rag-orchestrator`: el payload capturado es su única entrada). Arnés `tests/support/no-fuga.ts` con pasos ampliables. Commit `test(L1D-200)`; lo que falte para el verde, en `feat(L1D-200)`.
- [ ] 2.8 (test después: seed) Seed con identidades (a)–(e) vía `IdentityService`, idempotente; la guarda de entorno piloto se evalúa **antes** de leer las claves (test "en piloto se niega sin abrir los archivos de clave"); secretos AES y HMAC montados en `clinical-seed` en `infra/docker/docker-compose.yml`. Test de integración "el seed deja identidades cifradas, descifrables y sin duplicar al repetirse [US-046 AC-6]" en el mismo PR.
- [ ] 2.9 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-200)`.

- [ ] 2.10 (pendiente de confirmación) Si se confirma el fixture `SINT-52123456` para FX-T4a-a, usarlo en los tests y mantener en el arnés ambas formas; si no, se queda `52123456`.

## 3. cierre

- [ ] 3.1 `openspec validate l1d-200-identidad-cifrada-indice-ciego --strict`, tests de `clinical-api` en verde y humo de Compose (`clinical-seed` con los secretos).
