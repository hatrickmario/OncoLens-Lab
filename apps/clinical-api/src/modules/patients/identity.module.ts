import type { LeerArchivo } from '../../config/secrets.js';
import type { ConsultadorSql } from './identity.repository.js';
import type { IdentityService } from './identity.service.js';

export interface DependenciasDeLaIdentidad {
  readonly env: NodeJS.ProcessEnv;
  readonly readFile: LeerArchivo;
  readonly db: ConsultadorSql;
  /** 12 bytes aleatorios; solo los tests lo inyectan (por defecto, el generador del sistema). */
  readonly generarNonce?: () => Buffer;
}

/**
 * Compone el `IdentityService` desde la configuración: lee `IDENTITY_KEY_VERSION`, las claves AES por versión y la clave
 * del índice ciego (todas por archivo). Un fallo de configuración nombra la variable, nunca el valor (RN-10, RN-14).
 */
export function componerIdentidad(_dependencias: DependenciasDeLaIdentidad): IdentityService {
  throw new Error('no implementado');
}
