# Design — l1d-200-identidad-cifrada-indice-ciego

## Contexto

Columnas ya migradas (`data-model`, "Índice ciego único de la identidad"):
`national_id_ciphertext bytea`, `national_id_hmac text`, `full_name_ciphertext bytea`,
`key_version int`, única `(id_type, issuing_country, national_id_hmac)` `NULLS NOT DISTINCT`.
Las claves llegan por `IDENTITY_AES_KEY_FILE` y `BLIND_INDEX_HMAC_KEY_FILE` (US-035, solo en
`clinical-api`). ADR-6 fija AES-256-GCM en la aplicación + índice ciego HMAC-SHA256.

## Decisiones

Decisión cara de revertir (formato del cifrado persistido); ADR-6 ya la tomó, aquí solo se concreta:

- **D1 · Formato del texto cifrado.** `bytea` = `nonce (12 B) ‖ ciphertext ‖ tag (16 B)`; la versión
  va en `key_version`, no dentro del blob (una sola grafía). AAD = `patient_id|<campo>|<key_version>`
  (campo `national_id` o `full_name`): impide trasladar un blob a otra fila u otro campo sin que falle
  el tag. Alternativas descartadas: `pgcrypto` en la BD (la clave viajaría a PostgreSQL, contra ADR-6);
  AES-CBC + HMAC (más piezas, mismo resultado que GCM).
- **D2 · Índice ciego del documento.** `HMAC-SHA256(clave_hmac, "doc|" + id_type + "|" +
  numeroNormalizado)` en hex. **Regla del país emisor (Gate 1):** `issuing_country` **no entra** en el
  HMAC, porque `PatientSearchRequest` no lo trae y la búsqueda debe poder recalcular el índice solo con
  `idType` + `nationalId`; el país sigue en su columna y en la restricción única
  `(id_type, issuing_country, national_id_hmac)`, de modo que el mismo número en dos países son dos
  filas válidas con el mismo HMAC (la búsqueda devuelve ambas). Misma regla en L1D-202. `numeroNormalizado` = mayúsculas, sin
  espacios, puntos ni guiones (`normalizarNumeroDeDocumento()`, regla pura). El prefijo `doc|` separa
  el dominio de futuros índices (p. ej. el de nombre de L1D-202) con la **misma** clave HMAC.
- **D3 · Anillo de claves (AC-5, asumido).** `IDENTITY_KEY_VERSION` (activa, para cifrar) y
  `IDENTITY_AES_KEY_FILE` (clave de esa versión); las anteriores, opcionales, en
  `IDENTITY_AES_KEY_V<n>_FILE` solo para descifrar. Al arrancar, falta la clave activa → no arranca
  (el error nombra la clave, nunca su valor, como US-035 AC-5). La rotación operativa por Compose de
  `IDENTITY_AES_KEY_V<n>_FILE` (montar las claves anteriores) queda diferida: el anillo la soporta en el código, pero
  Compose y `.env.example` no las declaran en este change. El HMAC no rota en el MVP (rotarlo
  obliga a recalcular todos los índices; se anota como deuda si se pide).
- **D4 · Error de integridad (AC-3, asumido).** Fallo del tag GCM o versión desconocida →
  `IdentityIntegrityError` (código `IDENTITY_INTEGRITY_ERROR`); `manejadorFinalDeErrores` lo mapea a
  `500 ErrorInterno` (`error-interno.json`, cuerpo `{ error, message, traceId }` fijo) y registra solo
  `code` y `traceId`, nunca bytes ni texto. En el análisis (`/platform/evidence-analyses`), el fallo de
  integridad se convierte en `503 DESIDENTIFICACION_NO_DISPONIBLE` por fallo cerrado.
- **D5 · Seed (AC-6).** El *one-shot* `clinical-seed` usa `IdentityService` (no una copia del
  cifrador) y recibe los mismos dos secretos en Compose. La guarda de entorno piloto / datos reales se
  comprueba **antes de leer las claves**: en piloto termina sin abrir `IDENTITY_AES_KEY_FILE` ni
  `BLIND_INDEX_HMAC_KEY_FILE` (test). Identidades sintéticas `SINT-000000n` y nombres "Prueba Sintética n", ya usados en
  `contracts/examples/patient-summary-doctor.json`. Idempotente: si la fila existe, no recifra.
- **D6 · No-fuga (AC-4).** Arnés `buscarFugaDeIdentidad(valores, fuentes)` en
  `tests/support/no-fuga.ts`. **Valores buscados:** documento en claro (`1234567` y su forma con puntos `1.234.567`), "Lucía", "Rondón", la forma normalizada del
  nombre ("lucia fernanda rondon pena") y los valores hex de `national_id_hmac` y `full_name_hmac`
  (este último cuando exista la columna, L1D-202) leídos de la fila. **Fuentes (lo que cubre el test):** los logs de `clinical-api` (registrador y todo lo que `clinical-api` escriba con `console.*` o `process.stdout/stderr.write` durante los pasos, capturado por `capturarSalidaDelProceso()`; Vitest intercepta `console.*`, por eso se espía además de `process.std*`), el payload y las cabeceras capturados por MSW hacia
  `rag-orchestrator` (su única entrada: no se capturan logs propios de `rag-orchestrator` ni de `web`) y todas las filas de `audit.*`, `research.*` y `clinical.ai_analysis_record`. Los valores se derivan de la identidad guardada (documento, forma con puntos, nombre completo, forma normalizada y cada token del nombre de 4 o más caracteres). En este change cubre **registrar** (fixture vía `IdentityService`) y **analizar**
  (gateway de L1D-103); **ficha** y **búsqueda** las añaden sus changes (L1D-72, L1D-202) al mismo test
  como pasos nuevos (`🔗 Regresión [RN-10] → US-046`). US-046 pasa a Done cuando los cuatro pasos
  corren en `main`.
  **Limitaciones conocidas:** los tokens del nombre de menos de 4 caracteres (p. ej. "de", "Li") no se buscan, porque darían falsos positivos; solo se detectan en el nombre completo y su forma normalizada. Y el arnés ve lo que escribe `clinical-api` en este proceso de test, no los logs de contenedores. Tampoco se capturan `fs.writeSync(2, …)` ni las referencias a `console` o `process.stdout.write` guardadas antes de instalar el espía; un registrador futuro (pino, sonic-boom) debe capturarse por su propio destino.

## Privacidad y ownership

- **Fronteras:** la identidad en claro solo existe en memoria de `clinical-api` durante el request
  (fixture, seed, más tarde ficha y búsqueda). Nunca cruza a `rag-orchestrator`: el contexto del
  análisis ya va desidentificado (L1D-203, RN-11) y el arnés del AC-4 lo comprueba sobre el payload.
- **Claves:** solo en `clinical-api` y en su *one-shot* de seed (misma imagen, mismo servicio
  lógico); `rag-orchestrator`, `web` y PostgreSQL no las ven. `rag-orchestrator` no toca datos
  clínicos, `identity` ni `clinical-minio` (`REVOKE ALL` sobre `identity` ya verificado en CI).
- **Logs y auditoría:** nunca documento, nombre, blobs ni índices; el índice ciego tampoco va a
  `audit` (es un identificador enlazable).
- Solo datos sintéticos (RN-13); las claves de test se generan con `scripts/setup-secrets.sh`, nunca
  se versionan (RN-14).

## Contratos

- **Sin diff del spec:** este change no expone endpoints; el `500` usa `ErrorInterno` ya existente
  (L1D-197). `info.version` sin cambios.

## Dependencias y colaboradores

- `src/infrastructure/crypto/cifrador-aes-gcm.ts` (puerto `CifradorDeCampos`),
  `src/infrastructure/crypto/indice-ciego.ts` (puerto `IndiceCiego`), `src/infrastructure/crypto/anillo-de-claves.ts`.
- `src/modules/patients/identity.service.ts` (*factory* con puertos `CifradorDeCampos`, `IndiceCiego`,
  `IdentityRepository`, `GeneradorDeIds`), `identity.repository.ts`.
- Reglas extraídas: `normalizarNumeroDeDocumento()`, `aadDeCampo()`.
- `prisma/seed/` (identidades), `infra/docker/docker-compose.yml` (secretos en `clinical-seed`),
  `config.ts` (`IDENTITY_KEY_VERSION`, `IDENTITY_AES_KEY_V<n>_FILE`; claves listadas en el PR para
  `.env.example`).

- **D7 · FX-T4a-a sintético. Decidido (usuario, 2026-10-21, `[S2 resp. 11]`):** el documento es numérico, `1234567`
  (FX-T4a-a), y `123456` el número distinto del AC-2; sin prefijo `SINT-`. No cambia ningún mecanismo.

## Tests

Vitest unitarios (AC-2, AC-5: cifrador e índice puros, nonce y reloj inyectados); integración con
PostgreSQL real y SQL crudo (AC-1, AC-6); Supertest + MSW que captura el payload hacia
`rag-orchestrator` (AC-3, AC-4).

## Riesgos

- Montar las claves en el *one-shot* de seed amplía su superficie; mitigado porque es la misma
  imagen y no publica puertos (lo revisa `privacy-guardian`).
