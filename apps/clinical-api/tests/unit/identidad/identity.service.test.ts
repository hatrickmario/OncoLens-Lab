import { describe, expect, it } from 'vitest';
import { crearCifradorAesGcm } from '../../../src/infrastructure/crypto/cifrador-aes-gcm.js';
import { crearIndiceCiego } from '../../../src/infrastructure/crypto/indice-ciego.js';
import type {
  FilaDeIdentidad,
  IdentityRepository,
} from '../../../src/modules/patients/identity.repository.js';
import { createIdentityService } from '../../../src/modules/patients/identity.service.js';
import { FX_T4A_A, anilloDeTest, claveDeTest, nonceSecuencial } from '../../support/identidad.js';

/** Repository en memoria con la misma semántica que el SQL: no pisa una identidad existente. */
function repositorioEnMemoria(): IdentityRepository & { filas: Map<string, FilaDeIdentidad> } {
  const filas = new Map<string, FilaDeIdentidad>();
  return {
    filas,
    insertarSiNoExiste: (fila) => {
      if (filas.has(fila.patientId)) return Promise.resolve(false);
      filas.set(fila.patientId, fila);
      return Promise.resolve(true);
    },
    buscarPorPaciente: (patientId) => Promise.resolve(filas.get(patientId) ?? null),
    buscarPorPacientes: (patientIds) =>
      Promise.resolve(patientIds.flatMap((patientId) => filas.get(patientId) ?? [])),
  };
}

function servicioConRepositorio(repo: IdentityRepository) {
  return createIdentityService({
    cifrador: crearCifradorAesGcm({ anillo: anilloDeTest(), generarNonce: nonceSecuencial() }),
    indice: crearIndiceCiego(claveDeTest('hmac')),
    repo,
  });
}

const PACIENTE_1 = '00000001-0000-4000-8000-000000000001';
const PACIENTE_2 = '00000001-0000-4000-8000-000000000002';
const identidad = (patientId: string, issuingCountry: string | null) => ({
  patientId,
  idType: FX_T4A_A.idType,
  issuingCountry,
  numeroDeDocumento: FX_T4A_A.numeroDeDocumento,
  nombreCompleto: FX_T4A_A.nombreCompleto,
});

describe('IdentityService', () => {
  it('guarda el índice ciego sin el país emisor cuando el mismo número llega con otro país', async () => {
    const repo = repositorioEnMemoria();
    const servicio = servicioConRepositorio(repo);

    await servicio.guardar(identidad(PACIENTE_1, 'CO'));
    await servicio.guardar(identidad(PACIENTE_2, null));

    expect(repo.filas.get(PACIENTE_1)?.nationalIdHmac).toBe(
      repo.filas.get(PACIENTE_2)?.nationalIdHmac,
    );
  });

  it('devuelve existente y no recifra cuando el paciente ya tiene identidad', async () => {
    const repo = repositorioEnMemoria();
    const servicio = servicioConRepositorio(repo);
    await servicio.guardar(identidad(PACIENTE_1, null));
    const original = repo.filas.get(PACIENTE_1)?.nationalIdCiphertext;

    const resultado = await servicio.guardar(identidad(PACIENTE_1, null));

    expect(resultado).toBe('existente');
    expect(repo.filas.get(PACIENTE_1)?.nationalIdCiphertext).toBe(original);
  });

  it('devuelve null cuando el paciente no tiene identidad', async () => {
    const servicio = servicioConRepositorio(repositorioEnMemoria());

    expect(await servicio.descifrar(PACIENTE_1)).toBeNull();
  });

  it('descifra la identidad guardada con el cifrado ligado a su paciente', async () => {
    const servicio = servicioConRepositorio(repositorioEnMemoria());
    await servicio.guardar(identidad(PACIENTE_1, null));

    expect(await servicio.descifrar(PACIENTE_1)).toEqual({
      ...identidad(PACIENTE_1, null),
      keyVersion: 1,
    });
  });
});
