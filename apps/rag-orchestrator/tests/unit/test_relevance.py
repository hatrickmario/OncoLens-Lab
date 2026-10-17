from app.domain.relevance import ChunkPuntuado, filtrar_sobre_umbral, top_relevance_score


def _chunk(chunk_id: str, puntaje: float) -> ChunkPuntuado:
    return ChunkPuntuado(chunk_id, f"doc-{chunk_id}", f"texto de {chunk_id}", puntaje)


def test_filtrar_sobre_umbral_devuelve_lista_vacia_cuando_no_hay_chunks():
    assert filtrar_sobre_umbral([], 0.30) == []


def test_filtrar_sobre_umbral_conserva_solo_los_chunks_que_superan_el_umbral_en_su_orden():
    chunks = [_chunk("a", 0.87), _chunk("b", 0.10), _chunk("c", 0.40)]

    assert filtrar_sobre_umbral(chunks, 0.30) == [chunks[0], chunks[2]]


def test_filtrar_sobre_umbral_devuelve_lista_vacia_cuando_todos_los_chunks_estan_bajo_el_umbral():
    assert filtrar_sobre_umbral([_chunk("a", 0.05), _chunk("b", 0.10)], 0.30) == []


def test_filtrar_sobre_umbral_descarta_el_chunk_cuyo_puntaje_es_igual_al_umbral():
    # "Supera" es estricto: un chunk que apenas alcanza el umbral no cuenta como evidencia (RN-02).
    assert filtrar_sobre_umbral([_chunk("a", 0.30)], 0.30) == []


def test_top_relevance_score_devuelve_none_y_no_cero_cuando_no_hay_chunks_sobre_el_umbral():
    assert top_relevance_score([]) is None


def test_top_relevance_score_devuelve_el_maximo_de_los_chunks_sobre_el_umbral():
    chunks = [_chunk("a", 0.40), _chunk("b", 0.87), _chunk("c", 0.55)]

    assert top_relevance_score(chunks) == 0.87
