/** `AAAA-MM-DD` → `dd/mm/aaaa` partiendo la cadena: `new Date()` desplazaría un día según la zona horaria. */
export function formatearFechaIso(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}
