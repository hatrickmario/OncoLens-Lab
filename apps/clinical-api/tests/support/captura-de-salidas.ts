import { vi } from 'vitest';

/**
 * Captura TODO lo que un bloque escribe en consola o en los flujos estándar. Vitest intercepta `console.*`, así que
 * se espían ambos caminos (`console.*` y `process.std*.write`); si no, un `console.log(password)` pasaría inadvertido.
 */
export async function capturarSalidas(cuerpo: () => Promise<void>): Promise<string> {
  const texto: string[] = [];
  const guardar = (...argumentos: unknown[]): void => {
    texto.push(argumentos.map(String).join(' '));
  };
  const espias = [
    ...(['log', 'info', 'warn', 'error', 'debug'] as const).map((metodo) =>
      vi.spyOn(console, metodo).mockImplementation(guardar),
    ),
    vi.spyOn(process.stdout, 'write').mockImplementation((trozo: unknown) => {
      guardar(trozo);
      return true;
    }),
    vi.spyOn(process.stderr, 'write').mockImplementation((trozo: unknown) => {
      guardar(trozo);
      return true;
    }),
  ];
  try {
    await cuerpo();
  } finally {
    for (const espia of espias) espia.mockRestore();
  }
  return texto.join('\n');
}
