import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

type Entrada = NodeJS.ReadableStream & { isTTY?: boolean };

/** Una sola línea, sin el salto final (LF o CRLF); lo demás de la contraseña se conserva tal cual. */
export function sinSaltoFinal(texto: string): string {
  return texto.replace(/\r?\n$/, '');
}

async function leerTodo(entrada: NodeJS.ReadableStream): Promise<string> {
  const trozos: Buffer[] = [];
  for await (const trozo of entrada) trozos.push(Buffer.from(trozo as Uint8Array));
  return Buffer.concat(trozos).toString('utf8');
}

/** En una terminal pide la contraseña sin eco; en una tubería o archivo lee `stdin` completo. */
function pedirSinEco(entrada: Entrada, aviso: (texto: string) => void): Promise<string> {
  aviso('Contraseña: ');
  const mudo = new Writable({ write: (_trozo, _codificacion, listo) => listo() });
  const lector = createInterface({ input: entrada, output: mudo, terminal: true });
  return new Promise((resolver) => {
    lector.question('', (respuesta) => {
      lector.close();
      aviso('\n');
      resolver(respuesta);
    });
  });
}

export function leerContrasenaDe(
  entrada: Entrada,
  aviso: (texto: string) => void,
): Promise<string> {
  return entrada.isTTY === true
    ? pedirSinEco(entrada, aviso)
    : leerTodo(entrada).then(sinSaltoFinal);
}
