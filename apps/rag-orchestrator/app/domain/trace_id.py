"""Regla pura del `traceId` (`X-Trace-Id`): formato `req_` + 8–32 alfanuméricos."""

import re

_PATRON_TRACE_ID = re.compile(r"^req_[A-Za-z0-9]{8,32}$", re.ASCII)


def es_trace_id_valido(valor: str) -> bool:
    return _PATRON_TRACE_ID.fullmatch(valor) is not None
