# Matriz de trazabilidad — OncoLens (PRD v1.4)

> **Generada:** 2026-10-18 · cierre del sprint **S1** (`traceability-auditor`, `/sprint-close S1`), sobre `main` d4ad40d más los 9 changes archivados el 2026-10-18 (rama `sprint/S1-close`). Regenera la del cierre del Pre-S1 (2026-10-13).
> **Historias:** cada requisito → historias (y, para CAP y T, Features) cuyo texto lo cita en `backlog/features/*.md`; se excluyen las tablas "Conflictos de fuentes", y los rangos explícitos (`VM-1…VM-6`) cuentan para cada ID. Universos: FR, RN, CAP-01…CAP-11 (MVP), T, AC, ACT, ACP, M y TBD de `docs/PRD.md` v1.4; HU y OL de `readme.md`; NFR, SEG e IA de `backlog/01-requisitos.md` §4 (sin cambios respecto del Pre-S1).
> **Spec (openspec):** escenarios de `openspec/specs/**` que citan el ID (en el título, el cuerpo o su requisito) o que llevan el tag `[US-xxx AC-n]` de un AC que lo cita (o de cualquier AC de una historia que lo cita en su línea de metadatos). "+n en changes sin archivar" cuenta los escenarios equivalentes en los deltas de los 17 changes abiertos (`openspec/changes/<change>/specs`), que aún no están en la spec principal.
> **Test:** tests ejecutados y en verde con el tag `[US-xxx AC-n]` (o `@pytest.mark.ac`) de esos AC, o que nombran el ID: la CI de `main` en d4ad40d (Vitest de los workspaces, Vitest raíz, `test:secrets`, fixtures de `ci/tests/cases` y Pytest de `rag-orchestrator` sin `servicios_reales` ni `models`: todo en verde) más la integración de `clinical-api` contra PostgreSQL real, que la CI no ejecuta y que este cierre corrió en local (199/199 en verde). "(+n sin ejecutar)" = tests escritos que ni la CI ni este cierre ejecutaron: E2E de Playwright (deuda D-3) y Pytest `servicios_reales`/`models`. Cada `it`/`test` o función de Pytest cuenta una vez (sin expandir `each`/`parametrize`). "—" = sin spec o sin test todavía.
> Fuente: el Markdown de las Features; regenerar al cierre de cada sprint. El reporte del sprint está en [`sprints/S1-trazabilidad.md`](sprints/S1-trazabilidad.md); el del Pre-S1, en [`sprints/Pre-S1-trazabilidad.md`](sprints/Pre-S1-trazabilidad.md).

## Resumen de cobertura

| Familia | Universo | Con historia | Sin historia | Con spec (openspec) | Solo en changes sin archivar | Con test |
|---|---|---|---|---|---|---|
| FR | 31 | 31 | — | 9 | 2 | 10 |
| RN | 30 | 30 | — | 24 | 1 | 21 |
| NFR | 14 | 14 | — | 5 | 2 | 7 |
| SEG | 13 | 13 | — | 5 | 3 | 7 |
| IA | 11 | 11 | — | 2 | 2 | 4 |
| CAP | 11 | 11 | — | 0 | 0 | 0 |
| T | 5 | 5 | — | 0 | 0 | 0 |
| AC | 54 | 54 | — | 5 | 4 | 9 |
| ACT | 23 | 23 | — | 5 | 5 | 10 |
| ACP | 2 | 2 | — | 0 | 0 | 0 |
| M | 36 | 36 | — | 2 | 4 | 6 |
| HU | 26 | 26 | — | 2 | 0 | 2 |
| OL | 6 | 6 | — | 4 | 1 | 5 |
| TBD | 21 | 21 (TBD-05 como exclusión) | — | 2 | 1 | 3 |
| VM | 6 | 6 | — | 0 | 2 | 2 |
| G | 16 | 16 | — | 3 | 1 | 4 |

## FR

| ID | Historias | Spec (openspec) | Test |
|---|---|---|---|
| FR-01 | US-003, US-044, US-045, US-048, US-052, US-062, US-076, US-094, US-137, US-171, US-211, US-212, US-221, US-222 | `evidence-analysis-gateway` (4 esc.) · +11 en changes sin archivar | 19 · US-052, US-211 |
| FR-02 | US-046, US-047, US-048, US-204 | — | — |
| FR-03 | US-047, US-180, US-181, US-182, US-222 | — | — |
| FR-04 | US-003, US-018, US-043, US-051, US-091, US-092, US-102 | — | — |
| FR-05 | US-076, US-077, US-079 | — | — |
| FR-06 | US-078, US-081, US-082, US-083, US-084, US-085, US-086, US-087, US-092 | — | — |
| FR-07 | US-004, US-080, US-090, US-102, US-212 | — | — |
| FR-08 | US-100, US-107, US-108, US-109, US-110 | — | — |
| FR-09 | US-006, US-033, US-043, US-050, US-052, US-053, US-055, US-056, US-060, US-061, US-062, US-091, US-093, US-112, US-113, US-114, US-115, US-116, US-125, US-134, US-135, US-148, US-173, US-218, US-220, US-225, US-230, US-231a | `api-contracts` (78 esc.), `data-model` (20 esc.), `evidence-analysis-gateway` (32 esc.) · +56 en changes sin archivar | 110 · US-033, US-052, US-053, US-055, US-060, US-061, US-225, US-231a (+15 sin ejecutar) |
| FR-10 | US-061, US-064, US-066, US-067, US-070, US-095, US-097, US-125, US-129, US-130, US-134, US-166, US-196, US-231b | — · +37 en changes sin archivar | 47 · US-061, US-064, US-231b (+15 sin ejecutar) |
| FR-11 | US-061, US-071, US-101, US-124, US-136, US-172 | — | — |
| FR-12 | US-006, US-159, US-165, US-174, US-175, US-176, US-177, US-178, US-179, US-192 | — | — |
| FR-13 | US-070, US-193, US-194, US-196 | — | — |
| FR-14 | US-023, US-197, US-198, US-199, US-200, US-202, US-207, US-208 | — | — |
| FR-15 | US-003, US-006, US-045, US-048, US-203, US-204, US-212 | — | — |
| FR-16 | US-003, US-022, US-026, US-030, US-038, US-039, US-146, US-148, US-149, US-150, US-174, US-178, US-200, US-201, US-207, US-208 | `data-model` (44 esc.) | 63 · US-038, US-039 |
| FR-17 | US-025, US-038, US-047, US-209, US-210 | `data-model` (22 esc.) | 35 · US-038 |
| FR-18 | US-003, US-051, US-080, US-088, US-102, US-137, US-146, US-150, US-151, US-174, US-177, US-193, US-195, US-197, US-199, US-200, US-201, US-203, US-209, US-212 | — | — |
| FR-19 | US-007, US-058, US-059, US-117, US-118, US-119, US-120 | `data-model` (1 esc.) · +26 en changes sin archivar | 8 · US-058, US-059 (+23 sin ejecutar) |
| FR-20 | US-008, US-013, US-014, US-072, US-073, US-074, US-075, US-103, US-105, US-106, US-131, US-132, US-133, US-137, US-138, US-139, US-140, US-141, US-142, US-152, US-153, US-154, US-155, US-156, US-157, US-158, US-159, US-160, US-161, US-226, US-227, US-228, US-229, US-230 | — · +20 en changes sin archivar | 23 · US-075 |
| FR-21 | US-038, US-085, US-088, US-089, US-090, US-094, US-095, US-096, US-097, US-148, US-194, US-195 | `data-model` (22 esc.) | 35 · US-038 |
| FR-22 | US-086, US-094, US-098, US-099, US-109, US-110, US-113 | — | — |
| FR-23 | US-001, US-002, US-003, US-004, US-005, US-006, US-110, US-111, US-116, US-175, US-177 | — | — |
| FR-24 | US-157, US-166, US-167, US-168, US-169, US-170 | — | — |
| FR-25 | US-021, US-033, US-052, US-055, US-121, US-122, US-123, US-124, US-125, US-126, US-225, US-231a, US-231b | `api-contracts` (78 esc.), `data-model` (20 esc.), `evidence-analysis-gateway` (13 esc.) · +56 en changes sin archivar | 91 · US-033, US-052, US-055, US-225, US-231a, US-231b (+18 sin ejecutar) |
| FR-26 | US-158, US-162, US-163, US-164, US-165 | — | — |
| FR-27 | US-006, US-033, US-066, US-067, US-114, US-115, US-119, US-128, US-129, US-130, US-136, US-169, US-205, US-206, US-220 | `api-contracts` (78 esc.), `data-model` (20 esc.), `evidence-analysis-gateway` (1 esc.) · +9 en changes sin archivar | 17 · US-033 |
| FR-28 | US-020, US-171, US-172, US-173 | — | — |
| FR-29 | US-160, US-189, US-190, US-191, US-192, US-194, US-195, US-196 | — | — |
| FR-30 | US-161, US-186, US-187, US-188, US-206 | — | — |
| FR-31 | US-218, US-219 | `api-contracts` (6 esc.), `data-model` (4 esc.) | — |

## RN

| ID | Historias | Spec (openspec) | Test |
|---|---|---|---|
| RN-01 | US-007, US-009, US-033, US-057, US-063, US-064, US-095, US-105, US-123, US-125, US-129, US-130, US-134, US-161, US-166, US-169, US-170, US-187, US-191, US-216, US-218, US-219 | `api-contracts` (23 esc.), `data-model` (1 esc.), `evidence-analysis` (6 esc.) · +19 en changes sin archivar | 19 · US-033, US-063, US-064, US-231b |
| RN-02 | US-006, US-012, US-033, US-053, US-055, US-066, US-112, US-116, US-124, US-128, US-161, US-166, US-169, US-186, US-187, US-206, US-214, US-218, US-220, US-230, US-231a | `ai-evaluation` (2 esc.), `api-contracts` (5 esc.), `data-model` (1 esc.), `evidence-analysis-gateway` (1 esc.) · +12 en changes sin archivar | 18 · US-012, US-053, US-055, US-069, US-231a (+3 sin ejecutar) |
| RN-03 | US-032, US-033, US-055, US-061, US-112, US-125, US-134, US-135, US-231a | `api-contracts` (23 esc.), `data-model` (1 esc.) · +40 en changes sin archivar | 39 · US-033, US-055, US-061, US-231a (+15 sin ejecutar) |
| RN-04 | US-033, US-063, US-113, US-123, US-127, US-162, US-170, US-187, US-191, US-216, US-218 | `api-contracts` (4 esc.), `data-model` (1 esc.), `evidence-analysis` (6 esc.) · +3 en changes sin archivar | 7 · US-063 |
| RN-05 | US-055, US-059, US-112, US-117, US-119, US-159, US-165, US-174, US-220, US-231b | — · +43 en changes sin archivar | 41 · US-055, US-059, US-231b (+21 sin ejecutar) |
| RN-06 | US-006, US-009, US-015, US-038, US-053, US-066, US-070, US-087, US-096, US-101, US-124, US-134, US-136, US-150, US-166, US-177, US-189, US-218 | `data-model` (7 esc.), `evidence-analysis-gateway` (19 esc.) · +6 en changes sin archivar | 27 · US-053, US-069 |
| RN-07 | US-002, US-065, US-066, US-084, US-087, US-088, US-089, US-091, US-093, US-096, US-107, US-124 | `evidence-analysis-gateway` (1 esc.) | — |
| RN-08 | US-019, US-070, US-100, US-107, US-110, US-111 | — | — |
| RN-09 | US-070, US-180, US-181, US-182 | — | — |
| RN-10 | US-009, US-013, US-022, US-028, US-033, US-035, US-037, US-039, US-046, US-048, US-051, US-052, US-081, US-083, US-096, US-102, US-137, US-139, US-143, US-146, US-148, US-149, US-150, US-151, US-153, US-155, US-171, US-172, US-174, US-177, US-180, US-183, US-184, US-185, US-197, US-199, US-201, US-207, US-209, US-210, US-212, US-222 | `api-contracts` (24 esc.), `data-model` (35 esc.), `evidence-analysis-gateway` (5 esc.), `platform-observability` (3 esc.), `platform-stack` (2 esc.), `service-auth` (1 esc.) · +17 en changes sin archivar | 32 · US-033, US-035, US-039, US-052 |
| RN-11 | US-006, US-013, US-033, US-049, US-093, US-096, US-114, US-116, US-160, US-172, US-188, US-190, US-195, US-207, US-218, US-228, US-229, US-231b | `api-contracts` (23 esc.), `data-model` (5 esc.), `evidence-analysis-gateway` (5 esc.) · +26 en changes sin archivar | 20 · US-033, US-049 |
| RN-12 | US-012, US-014, US-033, US-034, US-037, US-050, US-072, US-082, US-095, US-143, US-166, US-177, US-180, US-224, US-230, US-231a, US-231b | `api-contracts` (81 esc.), `data-model` (20 esc.), `evidence-analysis-gateway` (1 esc.), `platform-observability` (1 esc.), `platform-stack` (6 esc.) · +52 en changes sin archivar | 80 · US-033, US-034, US-224, US-231a, US-231b (+15 sin ejecutar) |
| RN-13 | US-012, US-034, US-036, US-037, US-039, US-047, US-083, US-104, US-142, US-143, US-149, US-152, US-154, US-181, US-226, US-229, US-231b | `ai-evaluation` (2 esc.), `api-contracts` (3 esc.), `data-model` (22 esc.), `evidence-analysis-gateway` (3 esc.), `platform-observability` (1 esc.), `platform-stack` (6 esc.) · +10 en changes sin archivar | 61 · US-012, US-034, US-036, US-039 |
| RN-14 | DEC-01, US-009, US-012, US-014, US-035, US-036, US-039, US-059, US-072, US-104, US-120, US-143, US-144, US-145, US-152, US-153, US-156, US-216, US-217, US-226, US-227, US-228, US-229 | `ai-evaluation` (4 esc.), `api-contracts` (1 esc.), `data-model` (25 esc.), `platform-observability` (3 esc.), `platform-stack` (12 esc.) · +41 en changes sin archivar | 211 · US-012, US-035, US-036, US-039 |
| RN-15 | US-003, US-006, US-026, US-039, US-047, US-052, US-071, US-096, US-134, US-148, US-156, US-177, US-179, US-181, US-200, US-201, US-212, US-218 | `api-contracts` (1 esc.), `data-model` (8 esc.), `evidence-analysis-gateway` (13 esc.) · +2 en changes sin archivar | 24 · US-039, US-052 |
| RN-16 | US-047, US-146, US-181 | — | — |
| RN-17 | US-004, US-006, US-047, US-052, US-076, US-094, US-096, US-110, US-193, US-195, US-196, US-197, US-198, US-202 | `api-contracts` (1 esc.), `evidence-analysis-gateway` (13 esc.) | 12 · US-052 |
| RN-18 | US-047, US-199, US-209 | — | — |
| RN-19 | US-033, US-069, US-097, US-135, US-170, US-179, US-219 | `api-contracts` (78 esc.), `data-model` (20 esc.) · +20 en changes sin archivar | 33 · US-033, US-069 (+4 sin ejecutar) |
| RN-20 | US-007, US-031, US-033, US-043, US-062, US-143, US-171 | `api-contracts` (2 esc.) | — |
| RN-21 | US-007, US-012, US-058, US-059, US-117, US-120, US-206, US-228, US-229 | `ai-evaluation` (13 esc.), `data-model` (2 esc.) · +29 en changes sin archivar | 43 · US-012, US-058, US-059 (+23 sin ejecutar) |
| RN-22 | US-001, US-002, US-007, US-012, US-013, US-017, US-019, US-023, US-036, US-037, US-041, US-043, US-044, US-049, US-053, US-055, US-056, US-059, US-064, US-069, US-073, US-074, US-076, US-077, US-078, US-084, US-091, US-103, US-104, US-105, US-112, US-117, US-119, US-120, US-121, US-125, US-133, US-134, US-139, US-140, US-141, US-142, US-145, US-146, US-149, US-152, US-154, US-157, US-161, US-162, US-163, US-180, US-185, US-186, US-188, US-189, US-197, US-208, US-209, US-211, US-213, US-216, US-218, US-220, US-221, US-222, US-224, US-230, US-231a, US-231b | `ai-evaluation` (13 esc.), `api-contracts` (1 esc.), `data-model` (5 esc.), `evidence-analysis-gateway` (2 esc.), `platform-stack` (3 esc.), `service-auth` (1 esc.) · +66 en changes sin archivar | 102 · US-012, US-055, US-064, US-069, US-211, US-224, US-231a, US-231b (+19 sin ejecutar) |
| RN-23 | US-004, US-005, US-009, US-020, US-033, US-061, US-064, US-068, US-081, US-090, US-095, US-097, US-101, US-108, US-111, US-115, US-126, US-129, US-130, US-135, US-136, US-138, US-150, US-155, US-156, US-164, US-166, US-170, US-173, US-179, US-182, US-190, US-196, US-202, US-211, US-218, US-219 | `api-contracts` (23 esc.), `data-model` (1 esc.), `evidence-analysis-gateway` (2 esc.) · +49 en changes sin archivar | 48 · US-033, US-061, US-064, US-068, US-211 (+3 sin ejecutar) |
| RN-24 | US-033, US-063, US-160, US-170, US-187, US-190, US-191, US-205, US-218 | `api-contracts` (13 esc.), `data-model` (4 esc.), `evidence-analysis` (2 esc.) · +2 en changes sin archivar | 2 · US-033 |
| RN-25 | US-033, US-059, US-118, US-122, US-127, US-130, US-157, US-162, US-164, US-167, US-168 | `api-contracts` (4 esc.), `data-model` (1 esc.) · +13 en changes sin archivar | 6 · US-059 (+9 sin ejecutar) |
| RN-26 | US-005, US-006, US-071, US-101, US-124, US-126, US-134, US-135, US-136, US-138, US-148, US-164, US-172, US-173, US-175, US-179, US-198, US-204, US-219 | `evidence-analysis-gateway` (1 esc.) | — |
| RN-27 | US-002, US-010, US-029, US-039, US-041, US-042, US-086, US-092, US-094, US-098, US-106, US-109, US-110, US-193, US-207 | `data-model` (22 esc.) | 28 · US-039 |
| RN-28 | US-021, US-032, US-033, US-061, US-121, US-124, US-125, US-126, US-134, US-135, US-140, US-225 | `api-contracts` (23 esc.), `data-model` (1 esc.) · +20 en changes sin archivar | 12 · US-033, US-061, US-225 (+6 sin ejecutar) |
| RN-29 | DEC-01, US-001, US-011, US-018, US-021, US-042, US-085, US-094, US-121, US-129, US-171 | — | — |
| RN-30 | US-015, US-056, US-062, US-095, US-096, US-137, US-141, US-177, US-188, US-216 | `evidence-analysis-gateway` (1 esc.) · +1 en changes sin archivar | — |

## NFR

| ID | Historias | Spec (openspec) | Test |
|---|---|---|---|
| NFR-01 | US-012, US-141, US-188, US-224, US-231a, US-231b | `ai-evaluation` (13 esc.) · +39 en changes sin archivar | 99 · US-012, US-224, US-231a, US-231b (+15 sin ejecutar) |
| NFR-02 | US-103 | — | — |
| NFR-03 | US-105 | — | — |
| NFR-04 | US-056, US-141, US-188 | — | — |
| NFR-05 | US-012, US-034, US-224, US-231a, US-231b | `ai-evaluation` (13 esc.), `api-contracts` (7 esc.), `platform-observability` (7 esc.), `platform-stack` (17 esc.) · +39 en changes sin archivar | 127 · US-012, US-034, US-224, US-231a, US-231b (+15 sin ejecutar) |
| NFR-06 | US-145 | — | — |
| NFR-07 | US-078, US-180 | — | — |
| NFR-08 | US-053, US-096, US-177 | `evidence-analysis-gateway` (19 esc.) · +1 en changes sin archivar | 20 · US-053 |
| NFR-09 | US-046 | — | — |
| NFR-10 | US-028, US-034, US-037, US-183, US-184 | `api-contracts` (7 esc.), `platform-observability` (7 esc.), `platform-stack` (17 esc.) | 28 · US-034 |
| NFR-11 | US-037, US-045, US-046, US-048, US-078, US-102, US-143, US-146, US-149, US-150, US-151, US-180, US-183, US-184, US-211, US-216 | — · +2 en changes sin archivar | 2 · US-211 |
| NFR-12 | US-004, US-005, US-051, US-061, US-067, US-079, US-090, US-097, US-108, US-111, US-115, US-126, US-135, US-138, US-164, US-165, US-170, US-173, US-179, US-182, US-194, US-196, US-202, US-215 | — · +21 en changes sin archivar | 38 · US-061, US-215 (+6 sin ejecutar) |
| NFR-13 | US-033, US-036, US-213, US-214, US-215, US-223 | `api-contracts` (78 esc.), `data-model` (20 esc.) · +53 en changes sin archivar | 179 · US-033, US-036, US-215 |
| NFR-14 | US-041, US-121, US-171, US-176 | — | — |

## SEG

| ID | Historias | Spec (openspec) | Test |
|---|---|---|---|
| SEG-01 | US-044, US-060, US-144, US-147, US-211, US-216 | `evidence-analysis-gateway` (2 esc.) · +22 en changes sin archivar | 36 · US-060, US-211 |
| SEG-02 | US-045, US-147, US-204, US-212, US-221, US-222 | — · +1 en changes sin archivar | — |
| SEG-03 | US-046, US-102, US-185 | — | — |
| SEG-04 | US-049, US-083 | — · +13 en changes sin archivar | 17 · US-049 |
| SEG-05 | US-050 | — | — |
| SEG-06 | US-027, US-034, US-040, US-078, US-095, US-117, US-122, US-147, US-186 | `data-model` (2 esc.), `platform-stack` (4 esc.) · +1 en changes sin archivar | 8 · US-034 |
| SEG-07 | US-035, US-054, US-082 | `api-contracts` (2 esc.), `data-model` (3 esc.), `evidence-analysis-gateway` (1 esc.), `platform-observability` (3 esc.), `platform-stack` (12 esc.), `service-auth` (10 esc.) | 52 · US-035, US-054 |
| SEG-08 | US-035, US-144, US-145 | `data-model` (3 esc.), `platform-observability` (3 esc.), `platform-stack` (12 esc.) | 37 · US-035 |
| SEG-09 | US-034, US-060, US-144, US-183, US-212 | `api-contracts` (7 esc.), `platform-observability` (7 esc.), `platform-stack` (17 esc.) · +11 en changes sin archivar | 48 · US-034, US-060 |
| SEG-10 | US-149 | — | — |
| SEG-11 | US-143, US-144, US-204 | — | — |
| SEG-12 | US-036, US-042, US-144, US-216, US-217 | — · +32 en changes sin archivar | 132 · US-036 |
| SEG-13 | US-057, US-072, US-147, US-190 | — | — |

## IA

| ID | Historias | Spec (openspec) | Test |
|---|---|---|---|
| IA-01 | US-012, US-224, US-231a, US-231b | `ai-evaluation` (13 esc.) · +39 en changes sin archivar | 99 · US-012, US-224, US-231a, US-231b (+15 sin ejecutar) |
| IA-02 | US-113, US-230 | — | — |
| IA-03 | US-112, US-114, US-116 | — | — |
| IA-04 | US-064 | — · +8 en changes sin archivar | 10 · US-064 |
| IA-05 | US-186 | — | — |
| IA-06 | US-166 | — | — |
| IA-07 | US-055, US-231a | — · +2 en changes sin archivar | 3 · US-055, US-231a (+1 sin ejecutar) |
| IA-08 | US-082, US-084 | — | — |
| IA-09 | US-053 | `evidence-analysis-gateway` (5 esc.) | 5 · US-053 |
| IA-10 | US-014, US-016, US-072, US-226 | — | — |
| IA-11 | US-056, US-183 | — | — |

## CAP

| ID | Historias | Spec (openspec) | Test |
|---|---|---|---|
| CAP-01 | FEAT-01a, FEAT-01b, FEAT-01c | — | — |
| CAP-02 | FEAT-00, FEAT-01b, FEAT-02a, FEAT-02b, FEAT-02c, FEAT-11b, FEAT-PL2, FEAT-PL3 | — | — |
| CAP-03 | US-009, FEAT-01b, FEAT-03a, FEAT-03b, FEAT-PL3 | — | — |
| CAP-04 | FEAT-00, FEAT-03b, FEAT-04, FEAT-06b, FEAT-08b, FEAT-PL2, FEAT-PL3, FEAT-T2b | — | — |
| CAP-05 | US-005, US-020, US-142, FEAT-05, FEAT-06a, FEAT-06b, FEAT-07, FEAT-10a, FEAT-PL3 | — | — |
| CAP-06 | FEAT-00, FEAT-02b, FEAT-06a, FEAT-06b, FEAT-06c | — | — |
| CAP-07 | US-009, US-142, FEAT-06c, FEAT-07, FEAT-T5d | — | — |
| CAP-08 | US-142, FEAT-00, FEAT-06c, FEAT-08b, FEAT-08c, FEAT-10c, FEAT-PL3, FEAT-T2c, FEAT-T5d | — | — |
| CAP-09 | US-142, FEAT-06c, FEAT-09, FEAT-T5d | — | — |
| CAP-10 | FEAT-00, FEAT-06a, FEAT-08b, FEAT-09, FEAT-10a, FEAT-10b, FEAT-10c, FEAT-T1a, FEAT-T3 | — | — |
| CAP-11 | US-142, FEAT-02b, FEAT-11a, FEAT-11b, FEAT-11c, FEAT-PL2, FEAT-T2c, FEAT-T4b, FEAT-T5d | — | — |

## T

| ID | Historias | Spec (openspec) | Test |
|---|---|---|---|
| T-1 | US-195, FEAT-01a, FEAT-02a, FEAT-02b, FEAT-02c, FEAT-04, FEAT-06a, FEAT-07, FEAT-08b, FEAT-09, FEAT-11a, FEAT-11c, FEAT-PL5, FEAT-T1a, FEAT-T1b | — | — |
| T-2 | FEAT-04, FEAT-08c, FEAT-10a, FEAT-11a, FEAT-T2a, FEAT-T2b, FEAT-T2c | — | — |
| T-3 | FEAT-01c, FEAT-02c, FEAT-03a, FEAT-03b, FEAT-10a, FEAT-10b, FEAT-11b, FEAT-T3, FEAT-T4b, FEAT-T4c, FEAT-T4e | — | — |
| T-4 | FEAT-01b, FEAT-01c, FEAT-02b, FEAT-02c, FEAT-06a, FEAT-11c, FEAT-AP1, FEAT-PL1, FEAT-PL2, FEAT-PL5, FEAT-T1b, FEAT-T4a, FEAT-T4b, FEAT-T4c, FEAT-T4d, FEAT-T4e, FEAT-T4f | — | — |
| T-5 | FEAT-00, FEAT-PL1, FEAT-T3, FEAT-T5a, FEAT-T5b, FEAT-T5c, FEAT-T5d, FEAT-T5e | — | — |

## AC

| ID | Historias | Spec (openspec) | Test |
|---|---|---|---|
| AC-01.1 | US-076, US-078, US-080, US-081, US-082, US-083, US-087, US-099 | — | — |
| AC-01.2 | US-077, US-079 | — | — |
| AC-01.3 | US-084, US-085, US-087 | — | — |
| AC-02.1 | US-088, US-090, US-194 | — | — |
| AC-02.2 | US-085, US-088, US-090 | — | — |
| AC-02.3 | US-089, US-090, US-094, US-194 | — | — |
| AC-02.4 | US-051, US-089, US-090, US-091 | — | — |
| AC-02.5 | US-095, US-096, US-097, US-148, US-198 | — | — |
| AC-02.6 | US-002, US-065, US-088, US-089, US-091, US-094, US-096, US-107 | — | — |
| AC-02.7 | US-051, US-085, US-087, US-089, US-094 | — | — |
| AC-03.1 | US-080, US-089, US-099 | — | — |
| AC-03.2 | US-099, US-109, US-124, US-136 | — | — |
| AC-03.3 | US-086, US-094, US-098, US-109, US-110 | — | — |
| AC-03.4 | US-076, US-077, US-100, US-107 | — | — |
| AC-03.5 | US-098 | — | — |
| AC-04.1 | US-002, US-003, US-004, US-110, US-111 | — | — |
| AC-04.2 | US-005, US-006, US-071 | — | — |
| AC-04.3 | US-006, US-116, US-124, US-128, US-136 | — | — |
| AC-04.4 | US-001, US-002, US-006, US-131 | — | — |
| AC-04.5 | US-001, US-121 | — | — |
| AC-05.1 | US-052, US-062, US-114, US-115, US-173 | `evidence-analysis-gateway` (13 esc.) | 12 · US-052 |
| AC-05.2 | US-171, US-172, US-173 | — | — |
| AC-05.3 | US-033, US-061, US-169, US-225 | `api-contracts` (78 esc.), `data-model` (20 esc.) · +20 en changes sin archivar | 28 · US-033, US-061, US-225 (+6 sin ejecutar) |
| AC-06.1 | US-043, US-050, US-055, US-056, US-059, US-062, US-112, US-113, US-114, US-117, US-120, US-148, US-166, US-177, US-231a, US-231b | — · +53 en changes sin archivar | 65 · US-055, US-059, US-231a, US-231b (+26 sin ejecutar) |
| AC-06.2 | US-049, US-052, US-091, US-093 | `evidence-analysis-gateway` (13 esc.) · +13 en changes sin archivar | 29 · US-049, US-052 |
| AC-07.1 | US-166, US-170 | — | — |
| AC-07.2 | US-167, US-170 | — | — |
| AC-07.3 | US-168, US-170 | — | — |
| AC-07.4 | US-130, US-169 | — | — |
| AC-07.5 | US-134, US-168 | — | — |
| AC-08.1 | US-121, US-122, US-126 | — | — |
| AC-08.2 | US-124, US-126 | — | — |
| AC-08.3 | US-122, US-123, US-187 | — | — |
| AC-08.4 | US-124, US-126, US-136 | — | — |
| AC-08.5 | US-124, US-126 | — | — |
| AC-08.6 | US-021, US-071, US-121, US-124, US-126, US-130, US-135 | — | — |
| AC-08.7 | US-161, US-186, US-187, US-188, US-206 | — | — |
| AC-08.8 | US-125, US-126, US-134, US-140 | — | — |
| AC-08.9 | US-122, US-127 | — | — |
| AC-09.1 | US-158, US-162, US-164 | — | — |
| AC-09.2 | US-164 | — | — |
| AC-09.3 | US-162, US-163, US-164 | — | — |
| AC-09.4 | US-165 | — | — |
| AC-10.1 | US-061, US-125, US-126, US-134, US-135, US-225 | — · +11 en changes sin archivar | 11 · US-061, US-225 (+6 sin ejecutar) |
| AC-10.2 | US-061, US-101, US-126, US-135, US-136, US-164 | — · +8 en changes sin archivar | 8 · US-061 (+6 sin ejecutar) |
| AC-10.3 | US-068, US-135, US-170 | — · +21 en changes sin archivar | 20 · US-068 (+2 sin ejecutar) |
| AC-10.4 | US-053, US-055, US-061, US-062, US-063, US-064, US-134 | `evidence-analysis` (6 esc.), `evidence-analysis-gateway` (19 esc.) · +22 en changes sin archivar | 51 · US-053, US-055, US-061, US-063, US-064 (+9 sin ejecutar) |
| AC-11.1 | US-174, US-179, US-193 | — | — |
| AC-11.2 | US-175, US-176, US-179, US-192, US-195 | — | — |
| AC-11.2b | US-176, US-179 | — | — |
| AC-11.3 | US-177, US-178, US-179 | — | — |
| AC-11.4 | US-033, US-053, US-088, US-096, US-194, US-196 | `api-contracts` (2 esc.), `evidence-analysis-gateway` (19 esc.) · +1 en changes sin archivar | 20 · US-053 |
| AC-11.5 | US-195, US-196, US-198 | — | — |
| AC-11.6 | US-189, US-190, US-191, US-192, US-205 | — | — |

## ACT

| ID | Historias | Spec (openspec) | Test |
|---|---|---|---|
| AC-T1.1 | US-003, US-004, US-051, US-065, US-080, US-090, US-092, US-108, US-111, US-212 | — | — |
| AC-T1.2 | US-063, US-064, US-095, US-123, US-166, US-187, US-191 | `evidence-analysis` (6 esc.) · +8 en changes sin archivar | 17 · US-063, US-064 |
| AC-T1.3 | US-063, US-127 | `evidence-analysis` (6 esc.) | 7 · US-063 |
| AC-T1.4 | US-006, US-041, US-049, US-053, US-101, US-112, US-119, US-124, US-134, US-136, US-166, US-174, US-177, US-188, US-189 | `evidence-analysis-gateway` (20 esc.) · +2 en changes sin archivar | 21 · US-049, US-053 |
| AC-T1.5 | US-102, US-142, US-150, US-151, US-177 | — | — |
| AC-T2.1 | US-033, US-066, US-067, US-128, US-129, US-205, US-206 | `api-contracts` (78 esc.), `data-model` (20 esc.) · +9 en changes sin archivar | 17 · US-033 |
| AC-T2.2 | US-066, US-128, US-129, US-130, US-205, US-206 | — | — |
| AC-T2.3 | US-066, US-067, US-114, US-115, US-164, US-169, US-206 | — | — |
| AC-T2.4 | US-066, US-128, US-174, US-205 | — | — |
| AC-T3.1 | US-069, US-097, US-170 | — · +12 en changes sin archivar | 13 · US-069 (+4 sin ejecutar) |
| AC-T3.2 | US-070, US-099, US-100, US-107, US-109, US-180, US-181, US-182, US-193 | — | — |
| AC-T3.3 | US-071, US-101, US-136, US-142, US-148, US-197, US-198, US-202, US-204 | — | — |
| AC-T3.4 | US-068, US-173, US-196 | — · +21 en changes sin archivar | 20 · US-068 (+2 sin ejecutar) |
| AC-T4.1 | US-044, US-045, US-046, US-054, US-102, US-143, US-144, US-145, US-147, US-148, US-150, US-183, US-185, US-198, US-199, US-203, US-204, US-209, US-211 | `api-contracts` (2 esc.), `evidence-analysis-gateway` (3 esc.), `service-auth` (10 esc.) · +10 en changes sin archivar | 31 · US-054, US-211 |
| AC-T4.2 | US-046, US-049, US-093 | — · +13 en changes sin archivar | 17 · US-049 |
| AC-T4.3 | US-006, US-049, US-093, US-096, US-114, US-160, US-190, US-195 | — · +13 en changes sin archivar | 17 · US-049 |
| AC-T4.4 | US-040, US-122, US-147, US-166, US-186 | — | — |
| AC-T4.5 | US-047, US-143, US-146 | — | — |
| AC-T4.6 | US-148, US-149, US-150, US-177, US-200, US-201 | — | — |
| AC-T5.1 | US-103, US-105, US-106, US-131, US-132, US-140, US-142, US-157 | — | — |
| AC-T5.2 | US-075 | — · +20 en changes sin archivar | 23 · US-075 |
| AC-T5.3 | US-014, US-016, US-072, US-074, US-103, US-137, US-139, US-140, US-142, US-152, US-153, US-154, US-155, US-156, US-160, US-226, US-227, US-228, US-229, US-230 | — | — |
| AC-T5.4 | US-001, US-014, US-074, US-103, US-131, US-157, US-159, US-160, US-226, US-230 | — | — |

## ACP

| ID | Historias | Spec (openspec) | Test |
|---|---|---|---|
| AC-P.1a | US-207 | — | — |
| AC-P.1b | US-208 | — | — |

## M

| ID | Historias | Spec (openspec) | Test |
|---|---|---|---|
| M-01.1 | US-103 | — | — |
| M-01.2 | US-078, US-103 | — | — |
| M-01.3 | US-084, US-103, US-104 | — | — |
| M-02.1 | US-085, US-105 | — | — |
| M-02.2 | US-088, US-089, US-105 | — | — |
| M-02.3 | US-095, US-105, US-142 | — | — |
| M-02.4 | US-003, US-088, US-105 | — | — |
| M-02.5 | US-008, US-075, US-152 | — · +20 en changes sin archivar | 23 · US-075 |
| M-03.1 | US-099, US-106 | — | — |
| M-03.2 | US-106 | — | — |
| M-03.3 | US-099, US-106 | — | — |
| M-03.4 | US-086, US-098, US-106 | — | — |
| M-03.5 | US-086, US-098, US-106, US-109 | — | — |
| M-04.1 | US-002, US-131 | — | — |
| M-04.2 | US-002, US-131 | — | — |
| M-04.3 | DEC-01 | — | — |
| M-05.1 | US-020 | — | — |
| M-06.1 | US-055, US-072, US-073, US-133, US-226, US-230 | — · +5 en changes sin archivar | 6 · US-055 (+3 sin ejecutar) |
| M-06.2 | US-053, US-073, US-141, US-142, US-161 | `evidence-analysis-gateway` (19 esc.) · +1 en changes sin archivar | 20 · US-053 |
| M-07.1 | US-157, US-167 | — | — |
| M-07.2 | US-064, US-072, US-073, US-140, US-166 | — · +8 en changes sin archivar | 10 · US-064 |
| M-07.3 | US-157, US-168 | — | — |
| M-08.1 | US-024, US-132, US-153 | — | — |
| M-08.2 | US-122, US-132 | — | — |
| M-08.3 | US-007, US-118, US-120, US-132 | — | — |
| M-08.4 | US-118, US-132 | — | — |
| M-08.5 | US-161 | — | — |
| M-08.6 | US-122, US-132 | — | — |
| M-09.1 | US-158 | — | — |
| M-09.2 | US-158 | — | — |
| M-10.1 | US-055, US-063, US-064, US-072, US-140, US-142 | `evidence-analysis` (6 esc.) · +13 en changes sin archivar | 23 · US-055, US-063, US-064 (+3 sin ejecutar) |
| M-10.2 | US-068, US-072, US-140, US-142 | — · +21 en changes sin archivar | 20 · US-068 (+2 sin ejecutar) |
| M-11.1 | US-159, US-175, US-192 | — | — |
| M-11.2 | US-159, US-165, US-174 | — | — |
| M-11.3 | US-160, US-191 | — | — |
| M-11.4 | US-160, US-190 | — | — |

## HU

| ID | Historias | Spec (openspec) | Test |
|---|---|---|---|
| HU-01 | US-044, US-211 | `evidence-analysis-gateway` (2 esc.) · +10 en changes sin archivar | 16 · US-211 |
| HU-02 | US-045, US-051, US-091 | — | — |
| HU-03 | US-043, US-049, US-050, US-052, US-053, US-055, US-056, US-060, US-061, US-062, US-063, US-064, US-065, US-068, US-069, US-070, US-093, US-114, US-115, US-225, US-231a, US-231b | `evidence-analysis` (6 esc.), `evidence-analysis-gateway` (32 esc.) · +121 en changes sin archivar | 189 · US-049, US-052, US-053, US-055, US-060, US-061, US-063, US-064, US-068, US-069, US-225, US-231a, US-231b (+30 sin ejecutar) |
| HU-04 | US-076, US-077, US-078, US-079, US-081, US-082, US-083, US-085, US-086, US-087 | — | — |
| HU-05 | US-019, US-079, US-080, US-082, US-084, US-087, US-092, US-101, US-136, US-212 | — | — |
| HU-06 | US-048 | — | — |
| HU-07 | US-047, US-181 | — | — |
| HU-08 | US-180, US-181, US-182 | — | — |
| HU-09 | US-100, US-107, US-108, US-109, US-110 | — | — |
| HU-10 | US-134, US-135, US-136 | — | — |
| HU-11 | US-165, US-174, US-175, US-179 | — | — |
| HU-12 | US-193, US-194, US-196 | — | — |
| HU-13 | US-149, US-197, US-198, US-199, US-200, US-201, US-202, US-207 | — | — |
| HU-14 | US-146, US-148, US-149, US-200, US-201, US-203, US-204 | — | — |
| HU-15 | US-085, US-088, US-089, US-090, US-091, US-093, US-094, US-194 | — | — |
| HU-16 | US-095, US-096, US-097 | — | — |
| HU-17 | US-086, US-098, US-099, US-100, US-109 | — | — |
| HU-18 | US-002, US-003, US-004, US-005, US-006, US-110, US-111, US-116 | — | — |
| HU-19 | US-171, US-172, US-173 | — | — |
| HU-20 | US-066, US-067, US-127, US-128, US-129, US-130, US-162, US-163, US-164, US-165, US-205, US-206 | — | — |
| HU-21 | US-166, US-167, US-168, US-169, US-170 | — | — |
| HU-22 | US-121, US-122, US-123, US-124, US-125, US-126, US-127, US-136 | — | — |
| HU-23 | US-195, US-196 | — | — |
| HU-24 | US-175, US-176, US-177, US-178, US-179, US-189, US-190, US-191, US-192, US-205 | — | — |
| HU-25 | US-137, US-138, US-139, US-154 | — | — |
| HU-26 | US-186, US-187, US-188, US-206 | — | — |

## OL

| ID | Historias | Spec (openspec) | Test |
|---|---|---|---|
| OL-01 | US-002, US-035, US-038, US-039, US-040, US-046, US-051 | `data-model` (48 esc.), `platform-stack` (4 esc.) | 66 · US-035, US-038, US-039 |
| OL-02 | US-041, US-050, US-054, US-055, US-057, US-058, US-059, US-063, US-082, US-117, US-118, US-120, US-225 | `data-model` (1 esc.), `evidence-analysis` (3 esc.), `evidence-analysis-gateway` (1 esc.), `service-auth` (7 esc.) · +30 en changes sin archivar | 18 · US-054, US-055, US-058, US-059, US-063, US-225 (+24 sin ejecutar) |
| OL-03 | US-002, US-006, US-043, US-049, US-050, US-052, US-053, US-054, US-096, US-115, US-211 | `evidence-analysis-gateway` (35 esc.), `service-auth` (1 esc.) · +9 en changes sin archivar | 45 · US-049, US-052, US-053, US-054, US-211 |
| OL-04 | US-005, US-060, US-061, US-062, US-067, US-069, US-115, US-126, US-164, US-173 | — · +22 en changes sin archivar | 31 · US-060, US-061, US-069 (+7 sin ejecutar) |
| OL-05 | US-013, US-076, US-078, US-079, US-080, US-082, US-083, US-084, US-085, US-087, US-099, US-100, US-212 | — | — |
| OL-06 | US-012, US-013, US-014, US-016, US-036, US-072, US-073, US-074, US-075, US-103, US-105, US-106, US-131, US-132, US-133, US-140, US-141, US-152, US-157, US-226, US-228, US-229, US-230 | `ai-evaluation` (13 esc.) · +38 en changes sin archivar | 144 · US-012, US-036, US-075 |

## TBD

| ID | Historias | Spec (openspec) | Test |
|---|---|---|---|
| TBD-01 | US-012, US-224 | `ai-evaluation` (13 esc.) | 46 · US-012, US-224 |
| TBD-02 | US-017, US-073, US-074, US-103 | — | — |
| TBD-03 | US-055, US-073, US-084, US-104 | — · +1 en changes sin archivar | 1 · US-055 |
| TBD-04 | US-007 | — | — |
| TBD-05 | EXC (leucemia post-piloto, `02-adrs.md` §1.3) | — | — |
| TBD-06 | US-019, US-023, US-197 | — | — |
| TBD-07 | US-030, US-146 | — | — |
| TBD-08 | US-015, US-073, US-141, US-218, US-219 | — | — |
| TBD-09 | US-032, US-168 | — | — |
| TBD-10 | US-027, US-147 | — | — |
| TBD-11 | US-008 | — | — |
| TBD-12 | DEC-01, US-001 | — | — |
| TBD-13 | US-018, US-021 | — | — |
| TBD-14 | US-189 | — | — |
| TBD-15 | US-162, US-163 | — | — |
| TBD-16 | US-025 | — | — |
| TBD-17 | US-010, US-039, US-042 | `data-model` (3 esc.) | 4 · US-039 |
| TBD-18 | US-186, US-188 | — | — |
| TBD-19 | US-009 | — | — |
| TBD-20 | US-118, US-132 | — | — |
| TBD-21 | US-022, US-149 | — | — |

## VM

| ID | Historias | Spec (openspec) | Test |
|---|---|---|---|
| VM-1 | US-008, US-017, US-075, US-142, US-152, US-156 | — · +20 en changes sin archivar | 23 · US-075 |
| VM-2 | US-008, US-017, US-075, US-142, US-152, US-156 | — · +20 en changes sin archivar | 23 · US-075 |
| VM-3 | US-008, US-017, US-021, US-024, US-132, US-142, US-153, US-156 | — | — |
| VM-4 | US-008, US-017, US-021, US-031, US-137, US-138, US-139, US-142, US-154, US-156 | — | — |
| VM-5 | DEC-01, US-005, US-008, US-017, US-031, US-137, US-138, US-139, US-142, US-154, US-156 | — | — |
| VM-6 | US-008, US-017, US-142, US-155, US-156 | — | — |

## G

| ID | Historias | Spec (openspec) | Test |
|---|---|---|---|
| G-1 | US-142 | — | — |
| G-2 | US-017, US-140, US-142 | — | — |
| G-3 | US-012, US-224 | `ai-evaluation` (1 esc.) | 3 · US-012, US-224 |
| G-4 | US-072 | — | — |
| G-5 | US-012, US-015, US-073, US-141, US-142, US-161, US-224 | `ai-evaluation` (1 esc.) | 5 · US-012, US-224 |
| G-6 | US-012, US-103, US-224 | `ai-evaluation` (1 esc.) | 5 · US-012, US-224 |
| G-7 | US-103, US-104 | — | — |
| G-8 | US-013, US-049, US-050, US-072, US-083, US-103 | — · +13 en changes sin archivar | 17 · US-049 |
| G-9 | US-148, US-204 | — | — |
| G-10 | US-028, US-183, US-184, US-185 | — | — |
| G-11 | US-105 | — | — |
| G-12 | US-131 | — | — |
| G-13 | US-029, US-106 | — | — |
| G-14 | US-017, US-140, US-142, US-156 | — | — |
| G-15 | US-008, US-156 | — | — |
| G-16 | US-161 | — | — |

## Historias → Feature · sprint · estimación

| Historia | Linear | Feature | Sprint | Est. | Change archivado | Título |
|---|---|---|---|---|---|---|
| US-007 | L1D-50 | FEAT-00 | Pre-S1 | 3 | — | ADR-36 — [Pre-S1] Fuentes y licencias del corpus científico |
| US-008 | L1D-51 | FEAT-00 | Pre-S1 | 1 | — | DEC-02 — [Pre-S1] Protocolo y metas de las métricas de valor VM-1…VM-6 |
| US-009 | L1D-52 | FEAT-00 | Pre-S1 | 1 | — | DEC-03 — [Pre-S1] Estimación de capacidad de los Sprints 1–4 con el alcance v1.2 |
| US-010 | L1D-53 | FEAT-00 | Pre-S1 | 1 | — | DEC-04 — [Pre-S1] Términos de uso de LOINC, CUPS y ATC para versionar subconjuntos en el repo público |
| US-011 | L1D-54 | FEAT-00 | Pre-S1 | 1 | — | DEC-05 — [Pre-S1] Destino de TNM y Gleason/ISUP en próstata |
| US-033 | L1D-55 | FEAT-00 | Pre-S1 | 10 | `2026-10-13-l1d-55-contract-schema-freeze` | [Pre-S1] El contrato `EvidenceAnalysis` y el esquema de datos quedan congelados y verificables |
| US-076 | L1D-56 | FEAT-01a | 2 | 5 | — | El oncólogo sube un PDF y el sistema lo valida, lo guarda y encola su extracción |
| US-077 | L1D-57 | FEAT-01a | si-hay-capacidad | 3 | — | El oncólogo sube varios PDFs en una sola acción y cada uno avanza por su cuenta |
| US-078 | L1D-58 | FEAT-01a | 2 | 5 | — | La cola de extracción procesa cada documento una sola vez, reintenta y nunca deja documentos colgados |
| US-079 | L1D-59 | FEAT-01a | 2 | 3 | — | Desde la ficha y la vista de caso subo documentos y veo el estado de cada uno |
| US-080 | L1D-60 | FEAT-01a | si-hay-capacidad | 3 | — | Desde un dato extraído abro el documento de origen en la página del valor |
| US-081 | L1D-61 | FEAT-01a | si-hay-capacidad | 3 | — | Un documento en cuarentena o con identidad distinta se muestra con su motivo y no aporta datos |
| US-212 | L1D-62 | FEAT-01a | 3 | 2 | — | Descargo el PDF de origen de un dato desde la ficha o la vista de caso |
| US-082 | L1D-63 | FEAT-01b | 3 | 8 | — | `/documents/extract` lee el PDF en memoria, aplica OCR solo donde hace falta y estructura los datos clínicos |
| US-083 | L1D-64 | FEAT-01b | 3 | 5 | — | Un documento con datos personales inesperados queda en cuarentena sin persistir nada |
| US-084 | L1D-65 | FEAT-01b | 3 | 5 | — | La confianza de cada dato extraído se calcula con señales deterministas, nunca con la que declara el LLM |
| US-085 | L1D-66 | FEAT-01b | 3 | 5 | — | La extracción incluye eventos fechados, tratamientos previos y atributos clínicos con su procedencia |
| US-086 | L1D-67 | FEAT-01b | 3 | 3 | — | Backend 2 propone códigos del catálogo con su confianza, o `no_mapeado`, y nunca inventa uno |
| US-087 | L1D-68 | FEAT-01b | 3 | 5 | — | Lo extraído se persiste en una sola transacción, sin datos parciales y sin duplicar al reprocesar |
| US-180 | L1D-69 | FEAT-01c | 6 (si-hay-capacidad) | 5 | — | Al subir un PDF de alta, el sistema crea un borrador con los datos sugeridos y su confianza, sin crear ningún paciente |
| US-181 | L1D-70 | FEAT-01c | 6 (si-hay-capacidad) | 3 | — | El doctor confirma el borrador y solo entonces se crea el paciente, con las mismas reglas que el alta manual |
| US-182 | L1D-71 | FEAT-01c | 6 (si-hay-capacidad) | 3 | — | La pantalla "Nuevo paciente desde PDF" muestra lo sugerido, resalta lo de confianza media o baja y exige confirmar |
| US-051 | L1D-72 | FEAT-02a | 2 | 5 | — | Veo la ficha mínima del paciente con su diagnóstico vigente y sus biomarcadores recientes |
| US-019 | L1D-73 | FEAT-02a | 2 | 1 | — | DEC-09 — Reglas del semáforo de biomarcadores y de vigencia de diagnósticos |
| US-088 | L1D-74 | FEAT-02b | 3 | 5 | — | `GET …/case` arma el timeline con eventos derivados, sin duplicados y sin datos rechazados |
| US-089 | L1D-75 | FEAT-02b | 3 | 5 | — | La vista de caso agrupa los tratamientos previos por línea y muestra series de biomarcadores y atributos |
| US-090 | L1D-76 | FEAT-02b | 3 | 5 | — | Veo la vista de caso con el timeline, la sección sin fecha confiable, los tratamientos y las series |
| US-091 | L1D-77 | FEAT-02b | si-hay-capacidad | 3 | — | La tendencia de cada biomarcador se calcula con el umbral del catálogo y se muestra en la ficha, la vista de caso y el contexto |
| US-092 | L1D-78 | FEAT-02b | 3 | 3 | — | La ficha muestra los datos extraídos con su origen, confianza, revisión y semáforo |
| US-093 | L1D-79 | FEAT-02b | 3 | 3 | — | El contexto del análisis incluye las tendencias y los eventos extraídos, desidentificados |
| US-094 | L1D-80 | FEAT-02b | si-hay-capacidad | 5 | — | Registro a mano tratamientos previos y atributos clínicos que no están en los documentos |
| US-095 | L1D-81 | FEAT-02c | si-hay-capacidad | 5 | — | Backend 2 genera el resumen y solo devuelve afirmaciones respaldadas por los datos que referencian |
| US-096 | L1D-82 | FEAT-02c | si-hay-capacidad | 5 | — | `clinical-api` pide el resumen con referencias opacas, lo persiste antes de responder y lo enlaza a los datos |
| US-097 | L1D-83 | FEAT-02c | si-hay-capacidad | 3 | — | Veo el resumen del caso con sus enlaces, los avisos y cuántas afirmaciones se omitieron |
| US-098 | L1D-84 | FEAT-03a | 3 | 5 | — | Backend 1 decide la normalización final de todo dato, también del manual, y nunca acepta un código fuera del catálogo |
| US-099 | L1D-85 | FEAT-03a | 3 | 5 | — | El mismo dato en dos documentos queda como un solo dato con dos fuentes, y dos valores distintos del mismo día quedan en conflicto |
| US-100 | L1D-86 | FEAT-03a | 3 | 5 | — | Un dato extraído nunca reemplaza en silencio a uno verificado; en diagnósticos decide la fecha |
| US-107 | L1D-87 | FEAT-03b | 4 | 5 | — | El oncólogo verifica, corrige o rechaza un dato extraído y confirma o descarta un diagnóstico en conflicto |
| US-108 | L1D-88 | FEAT-03b | 4 | 3 | — | En la vista de caso tengo una lista de pendientes de revisión con sus acciones |
| US-109 | L1D-89 | FEAT-03b | si-hay-capacidad | 5 | — | El oncólogo resuelve los valores en conflicto y mapea los términos no reconocidos |
| US-110 | L1D-90 | FEAT-03b | 4 | 5 | — | Registro a mano un biomarcador o un dato del diagnóstico y queda normalizado por Backend 1 |
| US-111 | L1D-91 | FEAT-03b | 4 | 3 | — | Formularios de registro manual de biomarcadores y diagnóstico, prellenables desde un faltante |
| US-001 | L1D-93 | FEAT-04 | 4 | 5 | — | El catálogo de datos críticos se publica versionado y solo si cada ítem tiene campo de destino |
| US-002 | L1D-94 | FEAT-04 | 4 | 5 | — | El checklist calcula de forma determinista el estado de cada dato crítico |
| US-003 | L1D-95 | FEAT-04 | 4 | 3 | — | El checklist se expone por API en `/completeness`, en la vista de caso y en la ficha |
| US-004 | L1D-96 | FEAT-04 | 4 | 3 | — | En la vista de caso veo el checklist y desde un faltante puedo cargarlo o registrarlo |
| US-005 | L1D-97 | FEAT-04 | 4 | 3 | — | Antes de analizar, el panel lista los faltantes y me deja cargar información o continuar con aviso |
| US-006 | L1D-98 | FEAT-04 | 4 | 3 | — | Los faltantes viajan al análisis como "desconocido" y quedan persistidos con el análisis |
| US-171 | L1D-99 | FEAT-05 | 6 (si-hay-capacidad) | 3 | — | Las plantillas viven en el catálogo versionado, cada marcador tiene campo de destino y `GET /platform/question-templates` las sirve por tipo de cáncer |
| US-172 | L1D-100 | FEAT-05 | 6 (si-hay-capacidad) | 3 | — | La plantilla se completa con los datos del caso, marca lo que falta y nunca inserta identidad |
| US-173 | L1D-101 | FEAT-05 | 6 (si-hay-capacidad) | 3 | — | El panel ofrece las plantillas, permite editarlas antes de enviar y el análisis guarda qué plantilla se usó |
| US-012 | L1D-102 | FEAT-06a | 1 | 8 | `2026-10-18-l1d-102-adr39-embeddings-reranker-nli` | ADR-39 — Fase A: *embeddings*, *reranker* y NLI locales |
| US-052 | L1D-103 | FEAT-06a | 1 | 5 | `2026-10-18-l1d-103-gateway-contexto-clinico` | El gateway valida la pregunta y envía a `rag-orchestrator` el contexto clínico del caso |
| US-053 | L1D-104 | FEAT-06a | 1 | 5 | `2026-10-18-l1d-104-persistencia-analisis-fallos` | El análisis queda persistido antes de responder y un fallo nunca muestra resultados |
| US-054 | L1D-105 | FEAT-06a | 1 | 5 | `2026-10-18-l1d-105-service-jwt-auth` | `clinical-api` y `rag-orchestrator` se autentican con un JWT de servicio asimétrico |
| US-055 | L1D-106 | FEAT-06a | 1 | 5 | — (abierto: `l1d-106-retrieval-threshold-sin-evidencia`) | `/rag/query` recupera evidencia vigente, aplica el umbral y responde "sin evidencia" sin invocar al LLM |
| US-056 | L1D-107 | FEAT-06a | 4 | 3 | — | El límite de consultas, el semáforo de inferencia y el tiempo máximo protegen el LLM local |
| US-057 | L1D-108 | FEAT-06a | 4 | 3 | — | Las instrucciones del prompt quedan separadas de los datos para resistir *prompt injection* |
| US-112 | L1D-109 | FEAT-06b | si-hay-capacidad | 5 | — | La recuperación combina *dense* y *sparse* y mantiene la relevancia del *reranker* |
| US-113 | L1D-110 | FEAT-06b | si-hay-capacidad | 3 | — | Una pregunta en español recupera también evidencia en inglés, y viceversa |
| US-114 | L1D-111 | FEAT-06b | si-hay-capacidad | 5 | — | Las fuentes y los filtros del panel se aplican de verdad a la búsqueda y al contexto |
| US-115 | L1D-112 | FEAT-06b | si-hay-capacidad | 3 | — | El panel ofrece los selectores de fuentes y filtros que el backend ya aplica |
| US-116 | L1D-113 | FEAT-06b | 5 | 3 | — | Los datos críticos faltantes viajan como "desconocido" al prompt y enriquecen la consulta |
| US-058 | L1D-114 | FEAT-06c | 1 | 5 | — (abierto: `l1d-114-corpus-catalog-milvus`) | El catálogo del corpus y la colección de Milvus se crean con su esquema final |
| US-059 | L1D-115 | FEAT-06c | 1 | 5 | — (abierto: `l1d-115-seed-corpus-licensed`) | El corpus semilla de mama y próstata se carga solo con documentos de licencia aceptada |
| US-117 | L1D-116 | FEAT-06c | 4 | 8 | — | La ingesta del corpus es reanudable, indexa *dense* y *sparse*, versiona sin borrar y rechaza lo que no tiene licencia |
| US-118 | L1D-117 | FEAT-06c | 4 | 5 | — | Los metadatos de población, diseño y endpoint se toman de la fuente o se extraen y verifican, y una muestra se revisa a mano |
| US-119 | L1D-118 | FEAT-06c | si-hay-capacidad | 3 | — | Cada ingesta publica una `CorpusRelease` con su fecha de corte y la Base del análisis la usa |
| US-120 | L1D-119 | FEAT-06c | 4 | 3 | — | El corpus del S3 alcanza al menos 20 documentos por tipo de cáncer de al menos 3 fuentes abiertas |
| US-166 | L1D-120 | FEAT-07 | 6 (si-hay-capacidad) | 5 | — | Con dos o más fuentes sobre el umbral, `/rag/query` devuelve "Puntos de acuerdo" y "Discrepancias" y cada afirmación queda citada y con soporte |
| US-167 | L1D-121 | FEAT-07 | 6 (si-hay-capacidad) | 5 | — | Cada discrepancia explica la diferencia de contexto desde los metadatos, o dice "Causa de la discrepancia no identificada" |
| US-168 | L1D-122 | FEAT-07 | 6 (si-hay-capacidad) | 3 | — | Las etiquetas factuales de cada fuente se copian del catálogo y no se muestra ningún puntaje de solidez |
| US-169 | L1D-123 | FEAT-07 | 6 (si-hay-capacidad) | 3 | — | Con una sola fuente no hay sección de discrepancias, y una pregunta que no es de tratamiento recibe síntesis sin opciones |
| US-170 | L1D-124 | FEAT-07 | 6 (si-hay-capacidad) | 3 | — | El panel muestra la síntesis con sus citas, las etiquetas por fuente, el aviso de IA y lenguaje no prescriptivo |
| US-021 | L1D-125 | FEAT-08b | 5 | 1 | — | DEC-11 — Criterios de aplicabilidad, excluyentes y definición de "Parcial" |
| US-121 | L1D-126 | FEAT-08b | 5 | 3 | — | Los criterios de aplicabilidad de mama y próstata viven en el catálogo con destino, excluyentes y regla de "Parcial" |
| US-122 | L1D-127 | FEAT-08b | 5 | 5 | — | Con valores estructurados, el estado de cada criterio se calcula con la regla del catálogo y el valor del paciente se copia del contexto |
| US-123 | L1D-128 | FEAT-08b | 5 | 5 | — | Si la población del estudio solo está en el texto, el valor se acepta solo con cita y soporte; si no, queda "Desconocido" |
| US-124 | L1D-129 | FEAT-08b | 5 | 5 | — | Cada criterio desconocido dice su causa, avisa si el dato del paciente no está verificado, y un excluyente en "No coincide" marca la población como no comparable |
| US-125 | L1D-130 | FEAT-08b | 5 | 5 | — | Una opción con varias fuentes hereda la aplicabilidad de la más comparable, y con una sola opción se elige la más aplicable |
| US-126 | L1D-131 | FEAT-08b | 5 | 5 | — | Veo la tabla de aplicabilidad de cada fuente y el resumen de la opción, con estados en texto y los avisos visibles |
| US-186 | L1D-132 | FEAT-08c | Post-MVP | 5 | — | Si quedan criterios "No reportado por la fuente", el agente planifica sub-consultas dirigidas sobre el corpus dentro de los límites de configuración |
| US-187 | L1D-133 | FEAT-08c | Post-MVP | 5 | — | Lo que encuentra el agente pasa por la misma validación y solo regenera los bloques afectados |
| US-188 | L1D-134 | FEAT-08c | Post-MVP | 3 | — | El agente respeta el *deadline*, devuelve el primer resultado validado si no alcanza y queda registrado en `agent_steps` |
| US-162 | L1D-135 | FEAT-09 | 6 (si-hay-capacidad) | 3 | — | `/rag/query` entrega en cada cita la fecha, la versión, el tipo de fuente y el idioma copiados del catálogo, y la marca de antigüedad |
| US-163 | L1D-136 | FEAT-09 | 6 (si-hay-capacidad) | 3 | — | El umbral de antigüedad vive en configuración, lo confirma el oncólogo y aplica igual en análisis y en el historial |
| US-164 | L1D-137 | FEAT-09 | 6 (si-hay-capacidad) | 3 | — | La tarjeta y las citas muestran la vigencia, y el análisis muestra "Evidencia actualizada al ‹fecha de corte›" |
| US-165 | L1D-138 | FEAT-09 | 6 (si-hay-capacidad) | 3 | — | En el historial la cita conserva su versión original y avisa "Existe una versión más reciente" |
| US-060 | L1D-139 | FEAT-10a | 1 | 3 | — (abierto: `l1d-139-bff-route-handler-analisis`) | El navegador pide el análisis solo a `web` mediante un Route Handler |
| US-061 | L1D-140 | FEAT-10a | 1 | 5 | — (abierto: `l1d-140-panel-opcion-citas`) | El panel muestra la opción descrita con sus citas, la relevancia como metadato secundario y las descartadas aparte |
| US-062 | L1D-141 | FEAT-10a | 3 | 3 | — | El panel resuelve los estados de espera, sin evidencia y error sin mostrar detalles internos |
| US-101 | L1D-142 | FEAT-10b | 4 | 5 | — | La tarjeta de la opción avisa cuando el análisis depende de datos sin verificar, sin bloquear nada |
| US-136 | L1D-143 | FEAT-10b | 5 | 5 | — | La tarjeta avisa cuando la opción depende de datos en conflicto o de datos críticos faltantes, calculado por criterio y sin bloquear |
| US-134 | L1D-144 | FEAT-10c | 5 | 5 | — | `/rag/query` devuelve hasta 3 opciones en orden determinista por aplicabilidad y `clinical-api` las persiste en ese orden |
| US-135 | L1D-145 | FEAT-10c | 5 | 3 | — | El panel muestra hasta 3 tarjetas en el orden recibido, con el criterio de orden visible y sin rótulos de jerarquía clínica |
| US-015 | L1D-146 | FEAT-10c | si-hay-capacidad | 3 | — | ADR-42 — Streaming de eventos de progreso del análisis |
| US-174 | L1D-147 | FEAT-11a | 6 (si-hay-capacidad) | 5 | — | El historial lista y muestra cada análisis previo desde su snapshot, con su contexto, sus modelos, sus versiones y la Base del análisis idéntica |
| US-175 | L1D-148 | FEAT-11a | 6 (si-hay-capacidad) | 5 | — | Un análisis cuyos datos cambiaron se marca "Desactualizado: datos del paciente" con la lista de cambios |
| US-176 | L1D-149 | FEAT-11a | 6 (si-hay-capacidad) | 3 | — | Un análisis muestra "Evidencia o catálogo más reciente disponible" cuando cambió la `CorpusRelease` o la versión del catálogo |
| US-177 | L1D-150 | FEAT-11a | 6 (si-hay-capacidad) | 5 | — | Re-ejecutar con datos actuales crea un análisis nuevo, recalcula los faltantes y deja el anterior intacto |
| US-178 | L1D-151 | FEAT-11a | 6 (si-hay-capacidad) | 3 | — | La comparación muestra opciones nuevas, opciones eliminadas y criterios de aplicabilidad que cambiaron |
| US-179 | L1D-152 | FEAT-11a | 6 (si-hay-capacidad) | 5 | — | Veo el historial con sus marcas, abro un análisis previo, lo re-ejecuto y comparo el resultado |
| US-193 | L1D-153 | FEAT-11b | Post-MVP | 5 | — | El oncólogo registra el tratamiento decidido con fármacos normalizados y un vínculo opcional al análisis, nunca a una opción descartada |
| US-194 | L1D-154 | FEAT-11b | Post-MVP | 3 | — | La decisión aparece en el timeline como evento derivado "Decisión registrada en OncoLens", distinta de los tratamientos previos |
| US-195 | L1D-155 | FEAT-11b | Post-MVP | 5 | — | El oncólogo registra la evolución, que entra al timeline y al contexto y marca desactualizados los análisis afectados |
| US-196 | L1D-156 | FEAT-11b | Post-MVP | 3 | — | Desde la vista de caso y desde un análisis registro la decisión y la evolución |
| US-189 | L1D-157 | FEAT-11c | Post-MVP | 5 | — | El análisis nuevo recibe como memoria los últimos N análisis de evidencia del paciente y la evolución posterior a cada uno |
| US-190 | L1D-158 | FEAT-11c | Post-MVP | 3 | — | La memoria viaja desidentificada, rotulada "análisis previo de IA" y delimitada como datos |
| US-191 | L1D-159 | FEAT-11c | Post-MVP | 5 | — | Un análisis previo nunca es citable ni cuenta como soporte, y una afirmación que solo él respalda se descarta |
| US-192 | L1D-160 | FEAT-11c | Post-MVP | 3 | — | Si un análisis usado como memoria queda desactualizado, el que lo usó también queda desactualizado (cascada) |
| US-207 | L1D-161 | FEAT-AP1 | Post-MVP | 5 | — | Al egresar, se escribe un `EpisodeSnapshot` longitudinal con líneas, respuestas, progresiones y decisiones, sin identidad ni texto libre |
| US-208 | L1D-162 | FEAT-AP1 | Post-MVP | 1 | — | DEC-20 — Criterio de "listo" para construir la exploración de cohortes (CAP-12) |
| US-032 | L1D-163 | FEAT-AP1 | — | ? | — | ADR-7 — Scoring de solidez clínica de la evidencia |
| US-034 | L1D-164 | FEAT-PL1 | 1 | 5 | `2026-10-18-l1d-164-compose-stack` | El stack levanta con Compose y solo `web` publica un puerto |
| US-035 | L1D-165 | FEAT-PL1 | 1 | 3 | `2026-10-18-l1d-165-secrets-setup-scripts` | Los secretos y certificados se generan con scripts y nunca se versionan |
| US-036 | L1D-166 | FEAT-PL1 | 1 | 5 | — (abierto: `l1d-166-ci-build-contracts-scan`) | La CI valida build, contratos y bloquea secretos y PII en el repositorio |
| US-037 | L1D-167 | FEAT-PL1 | 2 | 3 | — | Toda configuración calibrable vive en variables validadas al arranque y los logs salen en JSON con `traceId` |
| US-038 | L1D-168 | FEAT-PL2 | 1 | 5 | `2026-10-18-l1d-168-initial-schema-migration` | La migración inicial crea el esquema completo de readme §3.1 |
| US-039 | L1D-169 | FEAT-PL2 | 1 | 3 | `2026-10-18-l1d-169-synthetic-demo-seed` | El seed sintético carga los pacientes de demo y se niega a correr en el entorno piloto |
| US-040 | L1D-170 | FEAT-PL2 | 2 | 5 | — | El rol `rag_corpus` solo accede al schema `corpus` y la CI lo prueba |
| US-041 | L1D-171 | FEAT-PL3 | 2 | 5 | — | El catálogo clínico v1 se monta en ambos backends y una versión distinta responde `409` |
| US-042 | L1D-172 | FEAT-PL3 | si-hay-capacidad | 3 | — | El validador mínimo impide publicar un catálogo con ítems sin destino o con estándares no permitidos |
| US-043 | L1D-173 | FEAT-PL3 | 2 | 3 | — | Solo los tipos de cáncer habilitados se analizan; el resto responde `tipo_no_habilitado` sin invocar a la IA |
| US-018 | L1D-174 | FEAT-PL3 | 2 | 1 | — | DEC-08 — Umbrales de tendencia por biomarcador |
| US-183 | L1D-175 | FEAT-PL5 | 6 (si-hay-capacidad) | 3 | — | `/metrics` expone en los tres servicios la latencia, los errores y las métricas de IA por etapa, sin datos personales ni puertos nuevos |
| US-184 | L1D-176 | FEAT-PL5 | 6 (si-hay-capacidad) | 3 | — | El 100 % de las requests lleva un `traceId` que se correlaciona de `web` a `rag-orchestrator` |
| US-185 | L1D-177 | FEAT-PL5 | 6 (si-hay-capacidad) | 5 | — | StrykerJS alcanza un *mutation score* ≥ 70 % sobre auth, autorización y cifrado, y la CI lo exige |
| US-028 | L1D-178 | FEAT-PL5 | Post-MVP | 3 | — | ADR-44 — Stack de observabilidad: métricas, paneles y *tracing* distribuido |
| US-063 | L1D-179 | FEAT-T1a | 1 | 5 | `2026-10-18-l1d-179-citas-chunk-recuperado` | Cada cita de una opción apunta a un chunk recuperado en esa consulta y copia sus datos del corpus |
| US-064 | L1D-180 | FEAT-T1a | 1 | 5 | — (abierto: `l1d-180-soporte-nli-descartadas`) | Las opciones sin soporte van a descartadas y las afirmaciones sueltas sin soporte se omiten y se cuentan |
| US-065 | L1D-181 | FEAT-T1a | 3 | 3 | — | Cada dato del contexto enviado a la IA viaja etiquetado con su procedencia y los rechazados nunca entran |
| US-127 | L1D-182 | FEAT-T1a | 5 | 3 | — | Los metadatos factuales de cada fuente se copian del catálogo del corpus y lo ausente se muestra "No disponible" |
| US-102 | L1D-183 | FEAT-T1b | 6 | 3 | — | Cada lectura de la ficha, de la vista de caso y de un documento queda auditada sin datos personales |
| US-150 | L1D-184 | FEAT-T1b | 6 | 5 | — | Cada acción sobre un paciente queda auditada sin datos personales: análisis, resumen, carga, revisión, registro manual y marcas de opt-out |
| US-151 | L1D-185 | FEAT-T1b | si-hay-capacidad | 3 | — | La cobertura de auditoría se verifica de forma automática y el recorrido completo deja la traza esperada, como prerrequisito del gate |
| US-066 | L1D-186 | FEAT-T2a | 2 | 5 | — | Todo análisis, incluido "sin evidencia", trae la Base del análisis con los incisos del S1 |
| US-067 | L1D-187 | FEAT-T2a | 2 | 3 | — | El panel muestra el resumen de la Base del análisis sin expandir y explica qué se buscó cuando no hay evidencia |
| US-128 | L1D-188 | FEAT-T2b | 4 | 3 | — | La Base del análisis declara los datos críticos faltantes y si el oncólogo continuó con aviso |
| US-129 | L1D-189 | FEAT-T2b | si-hay-capacidad | 5 | — | Los supuestos del análisis salen de reglas del catálogo o, si los propone la IA, solo se aceptan si están anclados a un faltante y nada los contradice |
| US-130 | L1D-190 | FEAT-T2b | si-hay-capacidad | 3 | — | La Base del análisis declara las limitaciones estructurales y solo las redactadas por la IA que tienen soporte |
| US-205 | L1D-191 | FEAT-T2c | Post-MVP | 3 | — | La Base del análisis lista los análisis previos usados como contexto, con la marca "contexto, no evidencia" |
| US-206 | L1D-192 | FEAT-T2c | Post-MVP | 3 | — | La Base del análisis lista cada sub-consulta de la búsqueda complementaria, su objetivo y si encontró evidencia |
| US-068 | L1D-193 | FEAT-T3 | 1 | 3 | — (abierto: `l1d-193-terminos-prohibidos-rn23`) | Ningún texto de la UI ni salida generada usa términos prescriptivos de la lista prohibida |
| US-069 | L1D-194 | FEAT-T3 | 1 | 2 | — (abierto: `l1d-194-aviso-ia-etiqueta-academica`) | Toda salida generada muestra el aviso de IA y la etiqueta "Uso académico/investigación" |
| US-070 | L1D-195 | FEAT-T3 | 4 | 2 | — | El análisis nunca ejecuta acciones clínicas por su cuenta |
| US-071 | L1D-196 | FEAT-T3 | 5 | 3 | — | Los avisos clínicos nunca bloquean; solo bloquean las reglas legales y de acceso |
| US-211 | L1D-197 | FEAT-T4a | 1 | 3 | — (abierto: `l1d-197-sesion-login-guard`) | Sesión mínima del S1: login con cookie opaca y guard en `web` y `clinical-api` |
| US-044 | L1D-198 | FEAT-T4a | 2 | 3 | — | Expiración, cierre de sesión y bloqueo por intentos fallidos |
| US-045 | L1D-199 | FEAT-T4a | 2 | 3 | — | Los usuarios se gestionan por CLI y cada acción exige el permiso de su rol |
| US-046 | L1D-200 | FEAT-T4a | 2 | 5 | — | La identidad del paciente se guarda cifrada y se busca por índice ciego |
| US-047 | L1D-201 | FEAT-T4a | 4 | 5 | — | Registro manual de un paciente con identidad cifrada, convenio y retención |
| US-048 | L1D-202 | FEAT-T4a | 2 | 5 | — | Listado y búsqueda exacta de pacientes |
| US-049 | L1D-203 | FEAT-T4a | 1 | 5 | — (abierto: `l1d-203-desidentificacion-contexto-ia`) | El contexto que sale hacia la IA está siempre desidentificado |
| US-050 | L1D-204 | FEAT-T4a | 6 | 3 | — | Los datos reales solo se procesan con modelos locales, sin respaldo en la nube |
| US-013 | L1D-205 | FEAT-T4a | 2 | 5 | — | ADR-40 — Detección y enmascaramiento de PII en texto libre y documentos |
| US-197 | L1D-206 | FEAT-T4b | Post-MVP | 5 | — | El tratante principal o un administrador egresa al paciente con un motivo, y la reactivación abre un episodio nuevo conservando la historia |
| US-198 | L1D-207 | FEAT-T4b | Post-MVP | 5 | — | Un paciente egresado no admite ningún registro hasta su reactivación: `422` en todos los endpoints de registro |
| US-199 | L1D-208 | FEAT-T4b | Post-MVP | 5 | — | La baja total borra identidad, representantes, histórico y PDFs, seudonimiza el resto y exige confirmación explícita |
| US-200 | L1D-209 | FEAT-T4b | Post-MVP | 3 | — | Un opt-out de investigación borra el histórico de investigación del paciente y evita el snapshot al egresar |
| US-201 | L1D-210 | FEAT-T4b | Post-MVP | 5 | — | El administrador registra y revoca marcas de opt-out desde la API y una pantalla de administración |
| US-202 | L1D-211 | FEAT-T4b | Post-MVP | 3 | — | Pantallas de egreso, reactivación y baja total con confirmación explícita |
| US-023 | L1D-212 | FEAT-T4b | Post-MVP | 1 | — | DEC-13 — Catálogo de motivos de egreso |
| US-148 | L1D-213 | FEAT-T4c | 6 | 5 | — | Toda generación con IA sobre un paciente con opt-out de `analisis_ia` responde `403` sin llamar a la IA, y lo demás sigue funcionando |
| US-149 | L1D-214 | FEAT-T4c | 6 | 3 | — | El administrador registra y revoca marcas de opt-out por CLI, con referencia externa y motivo del catálogo, auditadas |
| US-022 | L1D-215 | FEAT-T4c | 6 | 1 | — | DEC-12 — Canal de opt-out: referencia externa, catálogo de motivos y SLA |
| US-026 | L1D-216 | FEAT-T4c | 6 | 1 | — | DEC-16 — Alcance de "generación con IA" bajo el opt-out de `analisis_ia` |
| US-143 | L1D-217 | FEAT-T4d | 6 | 8 | — | `oncolens preflight real-data` verifica los prerrequisitos del gate y `clinical-api` no arranca con datos reales si alguno falla |
| US-144 | L1D-218 | FEAT-T4d | 6 | 5 | — | `web` solo se publica en la interfaz de la VPN y con HTTPS firmado por la CA interna |
| US-145 | L1D-219 | FEAT-T4d | 6 | 5 | — | Los backups de PostgreSQL y `clinical-minio` salen cifrados del equipo y su restauración se prueba |
| US-146 | L1D-220 | FEAT-T4d | si-hay-capacidad | 5 | — | El job de mayoría de edad marca "requiere ratificación" con la edad de configuración, sin bloquear al paciente |
| US-147 | L1D-221 | FEAT-T4d | 6 | 3 | — | La revisión de seguridad del piloto queda registrada y ningún hallazgo crítico o alto queda abierto al gate |
| US-027 | L1D-222 | FEAT-T4d | 6 | 2 | — | ADR-43 — Catálogo del corpus en una base de datos separada de la misma instancia |
| US-020 | L1D-223 | FEAT-T4d | 6 | 1 | — | DEC-10 — Plantillas de preguntas clínicas validadas por tipo de cáncer |
| US-025 | L1D-224 | FEAT-T4d | 6 | 1 | — | DEC-15 — Validación legal de diferir el job de retención |
| US-029 | L1D-225 | FEAT-T4d | 6 | 1 | — | DEC-17 — Mapeos terminológicos firmados |
| US-030 | L1D-226 | FEAT-T4d | 6 | 1 | — | DEC-18 — Edad de mayoría configurada |
| US-031 | L1D-227 | FEAT-T4d | 6 | 1 | — | DEC-19 — Criterio de "listo" por tipo de cáncer firmado |
| US-203 | L1D-228 | FEAT-T4e | Post-MVP | 3 | — | El administrador gestiona el equipo tratante de cada paciente, con un único tratante principal |
| US-204 | L1D-229 | FEAT-T4e | Post-MVP | 5 | — | Todos los endpoints de paciente responden `403` a un doctor que no pertenece al equipo tratante; `admin` ve todo |
| US-209 | L1D-230 | FEAT-T4f | Post-MVP | 5 | — | El job diario renueva hasta el máximo de 20 años y, al vencer, aplica la baja total de forma auditada |
| US-210 | L1D-231 | FEAT-T4f | Post-MVP | 3 | — | El administrador recibe el aviso de los vencimientos de los próximos 90 días, sin datos personales |
| US-014 | L1D-232 | FEAT-T5a | 2 | 3 | — | ADR-41 — Framework y protocolo de evaluación de calidad de la IA |
| US-016 | L1D-233 | FEAT-T5a | 2 | 1 | — | DEC-06 — Revisión clínica de la muestra del dataset de evaluación y del diccionario de significancia |
| US-017 | L1D-234 | FEAT-T5a | 2 | 1 | — | DEC-07 — Metas definitivas de evaluación técnica tras el baseline |
| US-072 | L1D-235 | FEAT-T5a | 2 | 8 | — | La suite `evaluate` mide recuperación, fidelidad, "sin evidencia", privacidad y lenguaje con datasets sintéticos de forma reproducible |
| US-073 | L1D-236 | FEAT-T5a | 2 | ? | — | El umbral de relevancia se calibra con el set de referencia y el baseline técnico del S1 queda registrado |
| US-074 | L1D-237 | FEAT-T5a | 2 | 3 | — | Todo PR que cambie modelo, prompt, umbral, catálogo o corpus ejecuta la suite y adjunta el reporte |
| US-075 | L1D-238 | FEAT-T5a | 1 | 3 | — (abierto: `l1d-238-baseline-manual-vm`) | El baseline manual de VM-1 y VM-2 se mide con los oncólogos antes de cerrar el S1 |
| US-103 | L1D-239 | FEAT-T5b | 3 | 5 | — | La suite mide la exactitud de la extracción, su p95, la calidad de `auto_aceptado` y el gate de PII en documentos |
| US-104 | L1D-240 | FEAT-T5b | si-hay-capacidad | 3 | — | Los umbrales de confianza del OCR se calibran con el set de referencia y quedan en configuración |
| US-105 | L1D-241 | FEAT-T5b | 3 | 5 | — | La suite mide la fidelidad del caso reconstruido, el origen de cada dato, el soporte del resumen y el p95 de la vista de caso |
| US-106 | L1D-242 | FEAT-T5b | si-hay-capacidad | 5 | — | La suite mide duplicados fusionados, conflictos detectados, fusiones incorrectas y mapeo terminológico |
| US-131 | L1D-243 | FEAT-T5b | 4 | 3 | — | La suite mide la sensibilidad y la especificidad del checklist de faltantes con faltantes sembrados |
| US-132 | L1D-244 | FEAT-T5b | 5 | 5 | — | La suite verifica que la aplicabilidad no inventa valores ni coincidencias y mide los metadatos del corpus |
| US-133 | L1D-245 | FEAT-T5b | si-hay-capacidad | 3 | — | La recuperación híbrida no retrocede respecto del baseline del S1 |
| US-140 | L1D-246 | FEAT-T5b | 5 | 5 | — | La suite mide que hasta 3 opciones siguen citadas, con soporte, no prescriptivas y en el orden de RN-28 |
| US-141 | L1D-247 | FEAT-T5b | si-hay-capacidad | 3 | — | El p95 del análisis se mide con aplicabilidad y hasta 3 opciones y la meta de G-5 se recalibra con ese dato |
| US-142 | L1D-248 | FEAT-T5b | 5 | 5 | — | G-Demo se verifica con el recorrido de la hipótesis sobre casos sintéticos y queda registrado |
| US-137 | L1D-249 | FEAT-T5c | 5 | 5 | — | `POST /platform/evidence-analyses/{id}/feedback` guarda la calificación 1–5 y los dos checkboxes de faltantes, sin texto libre |
| US-138 | L1D-250 | FEAT-T5c | 5 | 3 | — | Al cerrar cada análisis el panel ofrece la calificación 1–5 y, si hubo aviso de faltantes, los dos checkboxes, sin bloquear nada |
| US-139 | L1D-251 | FEAT-T5c | 5 | 3 | — | El reporte de feedback agrega VM-4 y VM-5 por cohorte y por versión de catálogo y dice si el catálogo queda validado |
| US-024 | L1D-252 | FEAT-T5c | 5 | 1 | — | DEC-14 — Revisión clínica de la muestra de aplicabilidad (VM-3) |
| US-152 | L1D-253 | FEAT-T5d | 6 | 5 | — | VM-1 y VM-2 se miden con OncoLens en ambas cohortes y se comparan con el baseline manual |
| US-153 | L1D-254 | FEAT-T5d | 6 | 3 | — | VM-3 se mide en la cohorte real con una muestra de tablas de aplicabilidad revisada por el oncólogo |
| US-154 | L1D-255 | FEAT-T5d | 6 | 2 | — | VM-4 y VM-5 del piloto se reportan por cohorte con su tasa de respuesta y las metas congeladas |
| US-155 | L1D-256 | FEAT-T5d | 6 | 3 | — | La encuesta de VM-6 se aplica al final del piloto y mide verificabilidad y no prescripción percibidas |
| US-156 | L1D-257 | FEAT-T5d | 6 | 3 | — | El informe de G-Éxito consolida VM-1…VM-6 contra las metas congeladas y los incidentes críticos, y cierra el piloto |
| US-157 | L1D-258 | FEAT-T5d | 6 (si-hay-capacidad) | 3 | — | La suite mide que la síntesis reporta las discrepancias sembradas y copia las etiquetas factuales del catálogo |
| US-158 | L1D-259 | FEAT-T5d | 6 (si-hay-capacidad) | 2 | — | La suite verifica que el 100 % de las citas muestra su fecha y el de las guías su versión |
| US-159 | L1D-260 | FEAT-T5d | 6 (si-hay-capacidad) | 3 | — | La suite verifica que todo análisis afectado queda desactualizado y que ninguna cita del historial deja de resolverse |
| US-160 | L1D-261 | FEAT-T5d | Post-MVP | 3 | — | La suite verifica que la memoria de análisis nunca es soporte y nunca lleva datos personales |
| US-161 | L1D-262 | FEAT-T5d | Post-MVP | 3 | — | La suite mide cuántos criterios resuelve la búsqueda complementaria y recalibra el p95 con el agente |
| US-213 | L1D-263 | FEAT-PL1 | 2 | 5 | — | La CI aplica umbrales de tamaño y complejidad, reglas de dependencias entre capas y la higiene de tests (TDD) en los dos backends y en `web` |
| US-214 | L1D-264 | FEAT-PL1 | 2 | 3 | — | Cada backend verifica sus respuestas contra su propio contrato OpenAPI y los consumidores solo usan clientes generados |
| US-215 | L1D-265 | FEAT-PL1 | 1 | 2 | — (abierto: `l1d-265-lint-format-base`) | Lint base y formato automático: ESLint con reglas de TypeScript, React, Next.js y accesibilidad, Prettier y `ruff format` |
| US-216 | L1D-266 | FEAT-PL1 | 6 | 3 | — | `web` envía cabeceras de seguridad, impide el clickjacking y no expone secretos ni HTML sin sanitizar |
| US-217 | L1D-267 | FEAT-PL1 | 2 | 2 | — | Las dependencias se auditan en cada PR y se actualizan con Dependabot |
| US-218 | L1D-268 | FEAT-10c | 5 | 5 | — | El oncólogo hace hasta 10 preguntas de seguimiento sobre un análisis y cada respuesta llega citada, validada y anclada a ese análisis |
| US-219 | L1D-269 | FEAT-10c | 5 | 3 | — | El panel muestra la conversación de seguimiento bajo el análisis, con su contexto fijo y el contador de preguntas |
| US-220 | L1D-270 | FEAT-06b | 5 | 3 | — | El oncólogo filtra la evidencia por antigüedad y el filtro queda registrado en la Base del análisis |
| US-221 | L1D-271 | FEAT-T4a | 6 (baja prioridad) | 3 | — | Una persona solicita una cuenta y el administrador la aprueba o la rechaza |
| US-222 | L1D-272 | FEAT-T4a | 6 (baja prioridad) | 5 | — | El administrador gestiona usuarios y altas de pacientes desde una consola, sin acceso a datos clínicos |
| US-223 | L1D-273 | FEAT-PL1 | 2 | 2 | — | `scripts/contracts` empaqueta los specs con `bundleDocument` de Redocly en lugar del empaquetador propio |
| US-224 | L1D-274 | FEAT-06a | 1 | 5 | — (abierto: `l1d-274-adr39-runtime-llm-ocr`) | ADR-39 — Fase B: runtime, LLM local, OCR y p95 extremo a extremo |
| US-225 | L1D-275 | FEAT-06a | 1 | 3 | — (abierto: `l1d-275-generacion-opcion-max-options`) | Con evidencia sobre el umbral, `/rag/query` genera la opción descrita, la recorta a `maxOptions` y responde con el contrato final |
| US-226 | pendiente | FEAT-T5e | propuesto 2 | 5 | — | La suite `evaluate` compara variantes de recuperación con la partición congelada, IC pareado por grupo y control de acceso a la prueba |
| US-227 | pendiente | FEAT-T5e | propuesto 2 | 3 | — | Un diagnóstico sin modelo y una auditoría ciega del oncólogo dicen cuántos fallos son del golden y cuántos del recuperador |
| US-228 | pendiente | FEAT-T5e | propuesto 2 | 5 | — | El lote A del dataset nuevo (≥ 60 preguntas con respuesta y ≥ 10 sin respuesta, independientes del actual) queda revisado por el oncólogo |
| US-229 | pendiente | FEAT-T5e | propuesto 2 o 3 | 5 | — | El lote B (≥ 100 preguntas con respuesta y ≥ 35 sin respuesta) queda sellado como la prueba ciega nueva |
| US-230 | pendiente | FEAT-T5e | propuesto 3 | 5 | — | Las ablaciones preinscritas de recuperación se ejecutan en desarrollo, se confirman en validación y se deciden una sola vez sobre la prueba nueva |
| US-231 | pendiente | FEAT-06a | — | ? | — | ADR-39 — Adapters reales de embeddings, reranker, detector de idioma y NLI (dividida) |
| US-231a | pendiente | FEAT-06a | 1 | 5 | — (abierto: `us-231a-adapters-reales-recuperacion`) | ADR-39 — Adapters reales de *embeddings*, *reranker* y detector de idioma detrás de los puertos de recuperación |
| US-231b | pendiente | FEAT-06a | 1 | 3 | — (abierto: `us-231b-adapter-nli-smoke-semilla`) | ADR-39 — Adapter real de NLI y *smoke* del corpus semilla con *embeddings* reales |
