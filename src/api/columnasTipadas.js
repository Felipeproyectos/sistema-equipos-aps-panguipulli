// Generado por migracion/generar_columnas_tipadas.py. No editar a mano.
//
// Columnas que NO son de texto, por tabla. Un `""` en cualquiera de ellas hace
// que Postgres rechace la escritura completa ("invalid input syntax for type
// date"), que es lo que impedia crear un equipo: el formulario manda sus
// fechas vacias como cadena vacia, no como nulo.
//
// clienteSupabase.js las usa para mandar NULL en esos casos. En las columnas
// de texto `""` es un valor valido y se respeta.

export const COLUMNAS_NO_TEXTO = {
  acceso_no_autorizado: new Set(["created_date", "fecha_intento", "is_sample", "updated_date"]),
  actividad: new Set(["ambulancia_operativa", "created_date", "fecha", "is_sample", "updated_date"]),
  alerta: new Set(["created_date", "fecha_resolucion", "is_sample", "notificacion_enviada", "updated_date"]),
  app_config: new Set(["created_date", "is_sample", "updated_date"]),
  asignacion_chofer: new Set(["created_date", "desde", "hasta", "is_sample", "updated_date"]),
  centro: new Set(["created_date", "emails_contacto", "is_sample", "sucursales", "updated_date"]),
  comentario: new Set(["created_date", "is_sample", "updated_date"]),
  config_alerta: new Set(["created_date", "emails", "is_sample", "updated_date"]),
  consumo_repuesto: new Set(["cantidad", "created_date", "fecha", "is_sample", "precio_unitario", "subtotal", "updated_date"]),
  equipo: new Set(["activo", "anio_adquisicion", "created_date", "fecha_fabricacion", "fecha_ultimo_informe_externo", "fecha_vencimiento_bateria", "fecha_vencimiento_permiso_circulacion", "fecha_vencimiento_revision_tecnica", "is_sample", "proxima_revision_anual", "updated_date", "usuarios_asignados", "valor"]),
  historial: new Set(["created_date", "is_sample", "updated_date"]),
  historial_mantenimiento: new Set(["created_date", "fecha_inspeccion", "is_sample", "proximo_mantenimiento", "updated_date"]),
  inspeccion_pendiente: new Set(["created_date", "fecha", "fecha_revision", "is_sample", "km_inicial", "updated_date"]),
  invitacion_pendiente: new Set(["aplicada", "created_date", "is_sample", "updated_date"]),
  kilometraje: new Set(["created_date", "fecha", "is_sample", "km_final", "km_inicial", "updated_date", "valor_km"]),
  orden_de_compra: new Set(["created_date", "fecha_emision", "fecha_entrega_estimada", "is_sample", "items", "total", "updated_date"]),
  orden_trabajo: new Set(["created_date", "fecha_asignacion", "fecha_fin", "fecha_inicio", "horas_estimadas", "horas_reales", "is_sample", "linea_tiempo", "repuestos_utilizados", "total", "total_mano_obra", "total_repuestos", "updated_date"]),
  parche: new Set(["activo", "cantidad", "created_date", "fecha_adquisicion", "fecha_vencimiento", "is_sample", "updated_date"]),
  proveedor: new Set(["activo", "created_date", "is_sample", "updated_date"]),
  repuesto: new Set(["activo", "created_date", "fecha_factura", "fecha_orden_compra", "is_sample", "precio_unitario", "stock_actual", "stock_minimo", "ultimo_reposicion", "updated_date"]),
  repuesto_critico: new Set(["created_date", "is_sample", "stock_unidades", "updated_date", "vida_util_pct"]),
  solicitud: new Set(["created_date", "fecha", "is_sample", "updated_date"]),
  solicitud_repuesto: new Set(["cantidad", "created_date", "fecha_aprobacion", "fecha_compra", "fecha_recepcion_bodega", "fecha_solicitud", "is_sample", "linea_tiempo", "precio_total_compra", "updated_date"]),
  solicitud_repuesto_salud: new Set(["cantidad", "created_date", "fecha_aprobacion", "fecha_compra", "fecha_recepcion_bodega", "fecha_solicitud", "is_sample", "linea_tiempo", "precio_total_compra", "updated_date"]),
  solicitud_stock: new Set(["cantidad", "created_date", "fecha_solicitud", "is_sample", "updated_date"]),
  usuario: new Set(["centros_asignados", "created_date", "force_password_reset", "is_sample", "is_service", "is_verified", "licencia_vencimiento", "subsedes_asignadas", "updated_date"]),
};
