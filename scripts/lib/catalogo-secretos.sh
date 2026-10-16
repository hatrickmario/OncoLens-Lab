#!/usr/bin/env bash
# Catálogo único de los archivos de secretos del stack (US-035). Lo cargan scripts/setup-secrets.sh (que los genera)
# y scripts/smoke/lib/fake-secrets.sh (que crea los ficticios de los tests estáticos); un test comprueba que todo
# secreto declarado en el Compose esté aquí. Agregar un secreto es agregarlo en este archivo.

# Claves de identidad: perderlas es perder la identidad cifrada (OL-01); nunca se rotan desde setup-secrets.sh.
CLAVES_DE_IDENTIDAD=(identity_aes_key blind_index_hmac_key)
CONTRASENAS=(
  pg_superuser_password pg_clinical_api_password pg_research_writer_password pg_rag_corpus_password
  pg_rag_corpus_migrator_password clinical_minio_root_password milvus_minio_root_password
  seed_doctor_password seed_admin_password
)
CONTRASENAS_PERFIL_TEST=(pg_test_admin_password)
ARCHIVOS_DE_PARES=(jwt_service_private.pem jwt_service_public.pem pg_ca.key pg_ca.crt pg_server.key pg_server.crt)
ARCHIVOS_RENDERIZADOS=(pg_hba.conf)
ARCHIVOS_RENDERIZADOS_PERFIL_TEST=(pg_hba.test.conf)

# archivos_del_catalogo [test]: un nombre por línea; con `test`, incluye los del perfil test/CI.
archivos_del_catalogo() {
  printf '%s\n' "${CLAVES_DE_IDENTIDAD[@]}" "${CONTRASENAS[@]}" "${ARCHIVOS_DE_PARES[@]}" "${ARCHIVOS_RENDERIZADOS[@]}"
  if [ "${1:-}" = test ]; then
    printf '%s\n' "${CONTRASENAS_PERFIL_TEST[@]}" "${ARCHIVOS_RENDERIZADOS_PERFIL_TEST[@]}"
  fi
}
