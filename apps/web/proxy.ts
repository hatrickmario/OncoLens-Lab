import { NextResponse, type NextRequest } from 'next/server';

export const config = { matcher: ['/pacientes/:path*'] };

// Esqueleto del commit en rojo (US-211 AC-4): deja pasar todo.
export function proxy(request: NextRequest) {
  void request;
  return NextResponse.next();
}
