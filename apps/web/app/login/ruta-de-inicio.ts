import 'server-only';

/**
 * Ruta de inicio tras el login (design D9). Variable de servidor, sin NEXT_PUBLIC_. Solo se aceptan rutas
 * internas: un valor como `//otro.sitio` o `https://…` convertiría `router.replace` en una redirección abierta.
 */
export function leerRutaDeInicio(
  entorno: Record<string, string | undefined> = process.env,
): string {
  const ruta = entorno['WEB_HOME_PATH'];
  if (ruta === undefined || !/^\/(?![/\\])/.test(ruta)) {
    throw new Error('WEB_HOME_PATH debe ser una ruta interna que empiece por una sola "/"');
  }
  return ruta;
}
