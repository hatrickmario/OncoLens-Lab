import type { IdType } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { CifradorDeCampos } from '../../infrastructure/crypto/cifrador-aes-gcm.js';
import type { IndiceCiego } from '../../infrastructure/crypto/indice-ciego.js';
import type { FilaDeIdentidad, IdentityRepository } from './identity.repository.js';

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
  /** Completa `full_name_hmac` de una identidad anterior a la columna (el seed); no recifra nada. `true` si lo completó. */
  completarIndiceDeNombre(patientId: string, nombreCompleto: string): Promise<boolean>;
  /** Descifra la identidad de varios pacientes en una consulta (la página de un listado); los que no tienen no aparecen. */
  descifrarVarios(patientIds: readonly string[]): Promise<IdentidadDescifrada[]>;
  indiceCiegoDeDocumento(idType: IdType, numeroDeDocumento: string): string;
  /** Pacientes con ese documento exacto, por índice ciego: no descifra nada. */
  buscarPorDocumento(idType: IdType, numeroDeDocumento: string): Promise<string[]>;
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
  const descifrarFila = (fila: FilaDeIdentidad): IdentidadDescifrada => ({
    patientId: fila.patientId,
    idType: fila.idType,
    issuingCountry: fila.issuingCountry,
    numeroDeDocumento: cifrador.descifrar(
      fila.nationalIdCiphertext,
      { patientId: fila.patientId, campo: 'national_id' },
      fila.keyVersion,
    ),
    nombreCompleto: cifrador.descifrar(
      fila.fullNameCiphertext,
      { patientId: fila.patientId, campo: 'full_name' },
      fila.keyVersion,
    ),
    keyVersion: fila.keyVersion,
  });
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
        fullNameHmac: indice.indiceDeNombre(identidad.nombreCompleto),
      });
      return insertada ? 'creada' : 'existente';
    },
    async descifrar(patientId) {
      const fila = await repo.buscarPorPaciente(patientId);
      return fila === null ? null : descifrarFila(fila);
    },
    completarIndiceDeNombre: (patientId, nombreCompleto) =>
      repo.completarIndiceDeNombre(patientId, indice.indiceDeNombre(nombreCompleto)),
    async descifrarVarios(patientIds) {
      return (await repo.buscarPorPacientes(patientIds)).map(descifrarFila);
    },
    indiceCiegoDeDocumento: (idType, numeroDeDocumento) =>
      indice.indiceDeDocumento(idType, numeroDeDocumento),
    buscarPorDocumento: (idType, numeroDeDocumento) =>
      repo.buscarPacientesPorDocumento(idType, indice.indiceDeDocumento(idType, numeroDeDocumento)),
  };
}
