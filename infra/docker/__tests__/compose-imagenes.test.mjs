import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearResolutor } from './lib/compose-resuelto.mjs';

// L1D-285 (test después, US-213 AC-13, [S3 resp. 14]): el registro quay.io respondió 503 en el PR #189 y tumbó el job
// integration-rag. etcd se descarga de gcr.io/etcd-development (misma versión, mismo healthcheck).
const TIEMPO_MAXIMO_MS = 60_000;

let resolver;
let limpiar;
beforeAll(() => {
  ({ resolver, limpiar } = crearResolutor());
});
afterAll(() => limpiar());

describe('docker-compose.yml · imágenes', () => {
  it('no usa ninguna imagen de quay.io en el Compose resuelto [US-213 AC-13]', () => {
    const imagenes = Object.values(resolver().services)
      .map((definicion) => definicion.image)
      .filter(Boolean);

    expect(imagenes.length).toBeGreaterThan(0);
    expect(imagenes.filter((imagen) => imagen.startsWith('quay.io/'))).toEqual([]);
  }, TIEMPO_MAXIMO_MS);

  it('descarga milvus-etcd de gcr.io con la misma versión v3.5.34 y conserva su healthcheck [US-213 AC-13]', () => {
    const etcd = resolver().services['milvus-etcd'];

    expect(etcd.image).toBe('gcr.io/etcd-development/etcd:v3.5.34');
    expect(etcd.healthcheck.test).toEqual(['CMD', 'etcdctl', 'endpoint', 'health']);
    expect(etcd.command).toContain('etcd');
  }, TIEMPO_MAXIMO_MS);
});
