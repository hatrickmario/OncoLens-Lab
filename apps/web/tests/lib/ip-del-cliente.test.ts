import { describe, expect, it } from 'vitest';
import { ipDelCliente } from '../../lib/server/ip-del-cliente';

const con = (valor: string | null) =>
  new Headers(valor === null ? {} : { 'X-Forwarded-For': valor });

describe('ipDelCliente', () => {
  it('devuelve la IP cuando la cabecera trae un solo valor', () => {
    expect(ipDelCliente(con('198.51.100.7'))).toBe('198.51.100.7');
  });

  it('devuelve el último valor cuando la cabecera trae una lista', () => {
    expect(ipDelCliente(con('203.0.113.9, 198.51.100.7'))).toBe('198.51.100.7');
  });

  it('quita el prefijo de IPv4 mapeada a IPv6', () => {
    expect(ipDelCliente(con('::FFFF:198.51.100.7'))).toBe('198.51.100.7');
  });

  it('acepta una IPv6', () => {
    expect(ipDelCliente(con('2001:db8::1'))).toBe('2001:db8::1');
  });

  it.each(['', 'no-es-ip', '198.51.100.7:8080', '999.1.1.1'])(
    'devuelve undefined cuando el valor %j no es una IP',
    (valor) => {
      expect(ipDelCliente(con(valor))).toBeUndefined();
    },
  );

  it('devuelve undefined cuando la cabecera falta', () => {
    expect(ipDelCliente(con(null))).toBeUndefined();
  });
});
