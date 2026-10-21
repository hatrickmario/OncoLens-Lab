"""Punto de entrada de uvicorn: `uvicorn app.main:app`.

Con ``MODEL_PROVIDER=local`` y ``LLM_PROVIDER=local`` se componen los bordes reales del corpus (Milvus y schema
``corpus``) y se sondan al arrancar; con cualquier otra combinación no se construye ni se importa ninguno (US-231b).

Los logs salen en JSON con el ``traceId`` de la request y la configuración se valida antes de componer nada: si es
inválida el proceso termina con código 1 y un ``configuracion_invalida`` por variable, sin el valor (US-037).
"""

from app.api.trace import trace_id_actual
from app.bootstrap import cargar_settings_o_salir, crear_app
from app.config.logging import configurar_logging_json
from app.infrastructure.corpus.composicion import puertos_del_corpus_segun_proveedores

configurar_logging_json(trace_id_actual)
_settings = cargar_settings_o_salir()
app = crear_app(_settings, corpus=puertos_del_corpus_segun_proveedores(_settings))
