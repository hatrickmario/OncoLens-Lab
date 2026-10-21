# Proposal — l1d-200-identidad-cifrada-indice-ciego

## Trazabilidad

L1D-200 · US-046 · FEAT-T4a (L1D-40) · Sprint 2 · Estimación **5** · RN-10 (dueña) · SEG-03 ·
NFR-09 · NFR-11 · AC-T4.1 (RN-10) · AC-T4.2 · ADR-6 · FR-02 (índice ciego) · OL-01 ·
US-046 AC-1…AC-6 · diseño `docs/ux/S2/pantallas-s2.md` S2-04 (la ficha muestra la identidad
descifrada; la pantalla es de L1D-72) · `backlog/sprints/S2-refinamiento.md`

## Por qué

`identity.patient_identity` existe desde la migración inicial, pero ningún código cifra ni descifra:
el seed no escribe identidades y no hay índice ciego calculado. Sin esto no hay listado, búsqueda
ni ficha con identidad (US-048, US-051), y RN-10 no tiene un test de no-fuga dueño.

## Qué cambia

- `apps/clinical-api/src/infrastructure/crypto/`: AES-256-GCM por campo (nonce aleatorio de 96 bits,
  AAD = `patient_id|campo|key_version`) y HMAC-SHA256 con clave separada para el índice ciego sobre
  `id_type|numero` normalizado (el país emisor **no** entra en el HMAC; ver D2 del design).
- `IdentityService` (`src/modules/patients/identity.service.ts`): `guardar`, `descifrar`,
  `indiceCiegoDeDocumento`; anillo de claves por versión (`IDENTITY_KEY_VERSION` activa, versiones
  anteriores solo para descifrar).
- Error de integridad `IDENTITY_INTEGRITY_ERROR` → `500 ErrorInterno` genérico sin datos.
- Seed de US-039 ampliado: identidades cifradas de los pacientes (a)–(e) con `id_type = sintetico`.
- Arnés de no-fuga de identidad (RN-10, dueño) sobre fuentes enumeradas, que amplían L1D-202 y L1D-72;
  busca el valor en claro, la forma normalizada del nombre y los valores de los índices ciegos.

> **Propuesto en el Gate 1 del S2 (pendiente de confirmación):** el documento de FX-T4a-a pasa de la
> cédula plausible `52123456` a un documento sintético con prefijo `SINT-` (`SINT-52123456`), para que
> ningún fixture parezca un documento real. Hasta la confirmación, los escenarios conservan `52123456`
> y el arnés busca ambas formas; el cambio del fixture en `backlog/` lo hace la sesión principal.

## Capacidades

- `patients-identity` (nueva en `openspec/specs`, prevista en `openspec/config.yaml`).

## Bounded contexts

clinical-platform (crypto, `IdentityService`, seed, Compose del *one-shot* de seed).

## Dependencias

- ↪ US-035 (claves `IDENTITY_AES_KEY_FILE`, `BLIND_INDEX_HMAC_KEY_FILE`, ya en `main`), US-038
  (esquema), US-039 (seed, `l1d-169`, archivado).
- 🔗 Consumida por `l1d-202-listado-busqueda-pacientes` (índice ciego, descifrado para la máscara) y
  por `l1d-72-ficha-minima-paciente` (US-051, ficha). Ambos amplían el AC-4 (`🔗 Regresión [RN-10] → US-046`).
- El paso "ejecutar un análisis" del AC-4 usa el gateway de L1D-103 (ya en `main`).

## Fuera de alcance

- Alta manual de pacientes por API (US-047, S4): en el S2 "registrarlo" es guardarlo con
  `IdentityService` desde el fixture.
- Representante legal cifrado más allá de reutilizar el mismo cifrador (US-047, FX-T4a-c).
- Descifrado auditado por CLI para opt-out (US-222, S6). Rotación masiva (re-cifrado) de identidades
  existentes: solo convivencia de versiones (AC-5).
- Índice ciego del nombre (P-4): lo propone `l1d-202-listado-busqueda-pacientes`.
