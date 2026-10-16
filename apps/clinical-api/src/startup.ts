import type { LeerArchivo } from './config/secrets.js';

export interface DependenciasDeArranque {
  readonly env: NodeJS.ProcessEnv;
  readonly readFile: LeerArchivo;
  readonly log: (linea: string) => void;
  readonly exit: (codigo: number) => void;
  readonly listen: (puerto: number) => void;
}

export function arrancar(_dependencias: DependenciasDeArranque): void {
  throw new Error('no implementado');
}
