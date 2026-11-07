/**
 * Id único por turno de prueba: assistant-ui descarta mensajes con el mismo id. Con letras y un solo dígito por grupo
 * para no parecerse a un número de documento (`pii-scan` marca series largas de dígitos).
 */
export function idDeTurnoDePrueba(numero: number): string {
  return `c0ffeeaa-bbbb-4ccc-8ddd-eeeeffff${numero.toString(16).padStart(4, 'a')}`;
}
