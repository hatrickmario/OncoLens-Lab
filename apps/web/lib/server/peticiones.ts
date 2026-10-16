import 'server-only';

/**
 * Lee el cuerpo como texto sin pasar de `maxBytes`: devuelve `null` si lo supera (por Content-Length o
 * mientras se lee), para no cargar en memoria cuerpos arbitrarios del navegador.
 */
export async function leerCuerpoAcotado(request: Request, maxBytes: number): Promise<string | null> {
  const declarado = Number(request.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > maxBytes) {
    return null;
  }
  if (request.body === null) {
    return '';
  }
  const lector = request.body.getReader();
  const decodificador = new TextDecoder();
  let texto = '';
  let leidos = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) {
      return texto + decodificador.decode();
    }
    leidos += value.byteLength;
    if (leidos > maxBytes) {
      await lector.cancel();
      return null;
    }
    texto += decodificador.decode(value, { stream: true });
  }
}
