#!/usr/bin/env bash
# Clave privada PEM generada ahora mismo; nunca se versiona.
set -euo pipefail
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out docs/ci-selftest-clave.pem 2>/dev/null
