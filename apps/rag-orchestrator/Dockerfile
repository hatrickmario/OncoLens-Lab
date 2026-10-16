# syntax=docker/dockerfile:1
# Contexto de construcción: la raíz del repositorio (infra/docker/docker-compose.yml usa context ../..).
FROM python:3.13.16-slim@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TMPDIR=/tmp
WORKDIR /app
COPY apps/rag-orchestrator/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt
COPY apps/rag-orchestrator/app ./app
# Usuario sin privilegios; /app queda de root y sin escritura (el Compose añade read_only: true).
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin oncolens
USER 10001
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=12 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
