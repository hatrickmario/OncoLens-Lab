# Contenedor PROVISIONAL de medición de ADR-39 (design D2): Linux arm64 sin GPU, hasta que la imagen de
# rag-orchestrator de L1D-164 (US-034) esté mergeada. Los pesos NO van en la imagen ni en el repo:
# se descargan a MODEL_CACHE_DIR (volumen) y las fuentes públicas a DATA_CACHE_DIR (volumen).
#
#   docker build --platform linux/arm64 -f apps/rag-orchestrator/eval/configs/adr39-medicion.Dockerfile \
#       -t oncolens-adr39-medicion apps/rag-orchestrator
# Base fijada por digest del índice multi-arquitectura (python:3.13-slim): la medición es reproducible.
FROM python:3.13-slim@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f

ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    MODEL_CACHE_DIR=/models \
    HF_HOME=/models/hf \
    DATA_CACHE_DIR=/data-cache \
    OMP_NUM_THREADS=8

WORKDIR /work/apps/rag-orchestrator
COPY requirements-eval.txt /tmp/requirements-eval.txt
RUN pip install -r /tmp/requirements-eval.txt

# Solo para EXPORTAR gte-multilingual-reranker-base (código remoto incompatible con transformers 5):
# se usa mediante PYTHONPATH=/opt/tf4 en el proceso de exportación; la medición no importa transformers.
RUN pip install --target /opt/tf4 'transformers==4.57.6' 'tokenizers==0.22.2'

# Sin root: los volúmenes de caché son del usuario de la medición. El código se monta en /work desde el worktree (no se copia): el reporte se escribe en reports/adr39/.
RUN useradd --create-home --uid 1000 medicion \
    && mkdir -p /models /data-cache \
    && chown -R medicion:medicion /models /data-cache /work
USER medicion

ENTRYPOINT ["python", "-m"]
CMD ["app.scripts.adr39_measure", "--help"]

