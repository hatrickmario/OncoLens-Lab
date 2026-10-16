'use client';

export async function cargar() {
  return import('@/lib/server/config');
}
