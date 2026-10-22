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

/** Identidad de un listado: el nombre solo viene si se pidió (`conNombre`); el resto siempre. */
export type IdentidadParcial = Omit<IdentidadDescifrada, 'nombreCompleto'> & {
  readonly nombreCompleto?: string;
};

/** Qué campos descifrar: por defecto todos; el nombre solo si `conNombre` no es `false` (minimización, RN-10). */
export interface OpcionesDeDescifrado {
  readonly conNombre?: boolean;
}

export interface IdentityService {
  /** Cifra y guarda; si el paciente ya tiene identidad no la recifra (`'existente'`). */
  guardar(identidad: IdentidadAGuardar): Promise<'creada' | 'existente'>;
  descifrar(patientId: string): Promise<IdentidadDescifrada | null>;
  /** Pacientes con ese nombre completo, igual tras normalizar (sin tildes, minúsculas, espacios colapsados): no descifra nada. */
  buscarPorNombre(nombreCompleto: string): Promise<string[]>;
  /** Completa `full_name_hmac` de una identidad anterior a la columna (el seed); no recifra nada. `true` si lo completó. */
  completarIndiceDeNombre(patientId: string, nombreCompleto: string): Promise<boolean>;
  /** Descifra la identidad de varios pacientes en una consulta (la página de un listado); los que no tienen no aparecen. */
  descifrarVarios(
    patientIds: readonly string[],
    opciones?: OpcionesDeDescifrado,
  ): Promise<IdentidadParcial[]>;
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
  const descifrarNombre = (fila: FilaDeIdentidad): string =>
    cifrador.descifrar(
      fila.fullNameCiphertext,
      { patientId: fila.patientId, campo: 'full_name' },
      fila.keyVersion,
    );
  /** Documento y metadatos; el nombre solo si se pide (el listado del admin no lo necesita). */
  const descifrarFila = (fila: FilaDeIdentidad, conNombre: boolean): IdentidadParcial => ({
    patientId: fila.patientId,
    idType: fila.idType,
    issuingCountry: fila.issuingCountry,
    numeroDeDocumento: cifrador.descifrar(
      fila.nationalIdCiphertext,
      { patientId: fila.patientId, campo: 'national_id' },
      fila.keyVersion,
    ),
    ...(conNombre && { nombreCompleto: descifrarNombre(fila) }),
    keyVersion: fila.keyVersion,
  });
  const descifrarCompleta = (fila: FilaDeIdentidad): IdentidadDescifrada => ({
    ...descifrarFila(fila, false),
    nombreCompleto: descifrarNombre(fila),
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
      return fila === null ? null : descifrarCompleta(fila);
    },
    buscarPorNombre: (nombreCompleto) =>
      repo.buscarPacientesPorNombre(indice.indiceDeNombre(nombreCompleto)),
    completarIndiceDeNombre: (patientId, nombreCompleto) =>
      repo.completarIndiceDeNombre(patientId, indice.indiceDeNombre(nombreCompleto)),
    async descifrarVarios(patientIds, opciones = {}) {
      const filas = await repo.buscarPorPacientes(patientIds);
      return filas.map((fila) => descifrarFila(fila, opciones.conNombre !== false));
    },
    buscarPorDocumento: (idType, numeroDeDocumento) =>
      repo.buscarPacientesPorDocumento(idType, indice.indiceDeDocumento(idType, numeroDeDocumento)),
  };
}
