/**
 * Día `YYYY-MM-DD` de una fecha del contrato, sin pasar por `Date` (evita el corrimiento por zona horaria).
 *
 * Módulo hoja, sin dependencias: lo usan las correcciones y la declaración de ausencia, y no puede importar nada de
 * `cuerpos.ts` ni de `cliente.ts` sin reintroducir el ciclo que detecta `sin-ciclos`.
 */
export const soloElDia = (fecha: string): string => fecha.slice(0, 10);
