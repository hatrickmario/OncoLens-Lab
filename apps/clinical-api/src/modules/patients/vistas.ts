/**
 * Vista de la respuesta según el PERMISO de la sesión (`x-view-by-permission`): `doctor_listado` es la de quien tiene
 * `clinical:read` (en la ficha, `PatientSummary`) y `admin` la de menor privilegio (`PatientAdminSummary`).
 */
export type VistaPorPermiso = 'doctor_listado' | 'admin';
