import type { CifradorDeCampos } from '../../infrastructure/crypto/cifrador-aes-gcm.js';
import type { IndiceCiego } from '../../infrastructure/crypto/indice-ciego.js';
import type { IdentityRepository } from './identity.repository.js';

export type TipoDeDocumento =
  | 'cedula_ciudadania'
  | 'tarjeta_identidad'
  | 'cedula_extranjeria'
  | 'pasaporte'
  | 'seudonimo'
  | 'sintetico';

export interface IdentidadAGuardar {
  readonly patientId: string;
  readonly idType: TipoDeDocumento;
  readonly issuingCountry: string | null;
  readonly numeroDeDocumento: string;
  readonly nombreCompleto: string;
}

export interface IdentidadDescifrada {
  readonly patientId: string;
  readonly idType: TipoDeDocumento;
  readonly issuingCountry: string | null;
  readonly numeroDeDocumento: string;
  readonly nombreCompleto: string;
  readonly keyVersion: number;
}

export interface IdentityService {
  /** Cifra y guarda; si el paciente ya tiene identidad no la recifra (`'existente'`). */
  guardar(identidad: IdentidadAGuardar): Promise<'creada' | 'existente'>;
  descifrar(patientId: string): Promise<IdentidadDescifrada | null>;
  indiceCiegoDeDocumento(idType: TipoDeDocumento, numeroDeDocumento: string): string;
}

export interface DependenciasDeIdentidad {
  readonly cifrador: CifradorDeCampos;
  readonly indice: IndiceCiego;
  readonly repo: IdentityRepository;
}

export function createIdentityService(_dependencias: DependenciasDeIdentidad): IdentityService {
  throw new Error('no implementado');
}
