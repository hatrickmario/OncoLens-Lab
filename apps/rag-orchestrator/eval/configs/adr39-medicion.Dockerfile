# Contenedor PROVISIONAL de medición de ADR-39 (design D2): Linux arm64 sin GPU, hasta que la imagen de
# rag-orchestrator de L1D-164 (US-034) esté mergeada. Los pesos NO van en la imagen ni en el repo:
# se descargan a MODEL_CACHE_DIR (volumen) y las fuentes públicas a DATA_CACHE_DIR (volumen).
#
#   docker build --platform linux/arm64 -f apps/rag-orchestrator/eval/configs/adr39-medicion.Dockerfile \
#       -t oncolens-adr39-medicion apps/rag-orchestrator
FROM python:3.13-slim

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
RUN pip install --target /opt/tf4 'transformers>=4.50,<4.58' 'tokenizers<0.23'

# El código se monta en /work desde el worktree (no se copia): el reporte se escribe en reports/adr39/.
ENTRYPOINT ["python", "-m"]
CMD ["app.scripts.adr39_measure", "--help"]
