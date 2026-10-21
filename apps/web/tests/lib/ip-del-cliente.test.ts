import { describe, expect, it } from 'vitest';
import { CABECERA_IP_DEL_SOCKET, firmarIpDelSocket } from '../../lib/server/cabecera-ip-del-socket';
import { ipDelCliente } from '../../lib/server/ip-del-cliente';

const firmada = (ip: string) => new Headers({ [CABECERA_IP_DEL_SOCKET]: firmarIpDelSocket(ip) });

describe('ipDelCliente', () => {
  it('devuelve la IP cuando la cabecera trae la firma de este proceso', () => {
    expect(ipDelCliente(firmada('198.51.100.7'))).toBe('198.51.100.7');
  });

  it('quita el prefijo de IPv4 mapeada a IPv6', () => {
    expect(ipDelCliente(firmada('::FFFF:198.51.100.7'))).toBe('198.51.100.7');
  });

  it('acepta una IPv6', () => {
    expect(ipDelCliente(firmada('2001:db8::1'))).toBe('2001:db8::1');
  });

  it.each(['', 'no-es-ip', '198.51.100.7:8080', '999.1.1.1'])(
    'devuelve undefined cuando el valor firmado %j no es una IP',
    (valor) => {
      expect(ipDelCliente(firmada(valor))).toBeUndefined();
    },
  );

  it('devuelve undefined cuando la cabecera falta', () => {
    expect(ipDelCliente(new Headers())).toBeUndefined();
  });

  it('devuelve undefined cuando la cabecera trae otra firma, aunque el valor sea una IP', () => {
    const ajena = new Headers({ [CABECERA_IP_DEL_SOCKET]: 'otro-secreto|203.0.113.66' });

    expect(ipDelCliente(ajena)).toBeUndefined();
  });

  it('devuelve undefined cuando solo llega X-Forwarded-For, lo falsifique o no el cliente', () => {
    const soloXff = new Headers({ 'X-Forwarded-For': '203.0.113.66' });

    expect(ipDelCliente(soloXff)).toBeUndefined();
  });
});
