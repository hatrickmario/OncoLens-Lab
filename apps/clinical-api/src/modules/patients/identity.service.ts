import type { IdType } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { CifradorDeCampos } from '../../infrastructure/crypto/cifrador-aes-gcm.js';
import type { IndiceCiego } from '../../infrastructure/crypto/indice-ciego.js';
import type { IdentityRepository } from './identity.repository.js';

export interface IdentidadAGuardar {
  readonly patientId: string;
  readonly idType: IdType;
  readonly issuingCountry: string | null;
  readonly numeroDeDocumento: string;
  readonly nombreCompleto: string;
}

export interface IdentidadDescifrada {
  readonly patientId: string;
  readonly idType: IdType;
  readonly issuingCountry: string | null;
  readonly numeroDeDocumento: string;
  readonly nombreCompleto: string;
  readonly keyVersion: number;
}

export interface IdentityService {
  /** Cifra y guarda; si el paciente ya tiene identidad no la recifra (`'existente'`). */
  guardar(identidad: IdentidadAGuardar): Promise<'creada' | 'existente'>;
  descifrar(patientId: string): Promise<IdentidadDescifrada | null>;
  indiceCiegoDeDocumento(idType: IdType, numeroDeDocumento: string): string;
}

export interface DependenciasDeIdentidad {
  readonly cifrador: CifradorDeCampos;
  readonly indice: IndiceCiego;
  readonly repo: IdentityRepository;
}

export function createIdentityService({
  cifrador,
  indice,
  repo,
}: DependenciasDeIdentidad): IdentityService {
  return {
    async guardar(identidad) {
      const { patientId } = identidad;
      const documento = cifrador.cifrar(identidad.numeroDeDocumento, {
        patientId,
        campo: 'national_id',
      });
      const nombre = cifrador.cifrar(identidad.nombreCompleto, { patientId, campo: 'full_name' });
      const insertada = await repo.insertarSiNoExiste({
        patientId,
        idType: identidad.idType,
        issuingCountry: identidad.issuingCountry,
        nationalIdCiphertext: documento.blob,
        nationalIdHmac: indice.indiceDeDocumento(identidad.idType, identidad.numeroDeDocumento),
        fullNameCiphertext: nombre.blob,
        keyVersion: documento.keyVersion,
      });
      return insertada ? 'creada' : 'existente';
    },
    async descifrar(patientId) {
      const fila = await repo.buscarPorPaciente(patientId);
      if (fila === null) return null;
      return {
        patientId,
        idType: fila.idType,
        issuingCountry: fila.issuingCountry,
        numeroDeDocumento: cifrador.descifrar(
          fila.nationalIdCiphertext,
          { patientId, campo: 'national_id' },
          fila.keyVersion,
        ),
        nombreCompleto: cifrador.descifrar(
          fila.fullNameCiphertext,
          { patientId, campo: 'full_name' },
          fila.keyVersion,
        ),
        keyVersion: fila.keyVersion,
      };
    },
    indiceCiegoDeDocumento: (idType, numeroDeDocumento) =>
      indice.indiceDeDocumento(idType, numeroDeDocumento),
  };
}
