"""Punto de entrada de uvicorn: `uvicorn app.main:app`.

Con ``MODEL_PROVIDER=local`` y ``LLM_PROVIDER=local`` se componen los bordes reales del corpus (Milvus y schema
``corpus``) y se sondan al arrancar; con cualquier otra combinación no se construye ni se importa ninguno (US-231b).
"""

from app.bootstrap import crear_app
from app.config.settings import Settings
from app.infrastructure.corpus.composicion import puertos_del_corpus_segun_proveedores

_settings = Settings()
app = crear_app(_settings, corpus=puertos_del_corpus_segun_proveedores(_settings))
