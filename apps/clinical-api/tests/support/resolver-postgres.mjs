// Precarga de los tests que lanzan procesos reales: el certificado de PostgreSQL solo tiene SAN `postgres`, así que
// el nombre `postgres` se resuelve a loopback y la verificación TLS del servidor sigue activa (SEG-08).
import dns from 'node:dns';

const original = dns.lookup;
dns.lookup = function lookup(nombre, ...resto) {
  return original.call(dns, nombre === 'postgres' ? '127.0.0.1' : nombre, ...resto);
};
