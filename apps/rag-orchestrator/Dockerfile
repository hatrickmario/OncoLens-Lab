# syntax=docker/dockerfile:1
# Contexto de construcción: la raíz del repositorio (infra/docker/docker-compose.yml usa context ../..).
FROM python:3.14.7-slim@sha256:51dafde81dbdb6ebde285137a295cf18a47ca95234fe388a343719cb97305b3d AS dependencias
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TMPDIR=/tmp
WORKDIR /app
COPY apps/rag-orchestrator/requirements.txt ./requirements.txt
RUN pip install --only-binary=:all: -r requirements.txt

# Target de test (L1D-277, solo CI y local; el Compose de producción no lo usa): dependencias de desarrollo y el `node` que
# el fixture de sesión de Pytest necesita para empaquetar el spec (scripts/contracts/bundle-json.mjs, misma versión que
# .nvmrc). Sin código de la aplicación ni de los tests: el Compose de test los monta de solo lectura.
FROM dependencias AS pruebas
COPY apps/rag-orchestrator/requirements-dev.txt ./requirements-dev.txt
RUN pip install --only-binary=:all: -r requirements-dev.txt
COPY --from=node:22.23.3-slim@sha256:3ed98443660ff48413b5af19ecefce3b9d50845a901a43420d47cc63a9fddbe9 /usr/local/bin/node /usr/local/bin/node

# Imagen de producción: es el ÚLTIMO stage, el que construye `docker compose build` sin `target`.
FROM dependencias AS runtime
COPY apps/rag-orchestrator/app ./app
# Usuario sin privilegios; /app queda de root y sin escritura (el Compose añade read_only: true).
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin oncolens
USER 10001
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=12 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
