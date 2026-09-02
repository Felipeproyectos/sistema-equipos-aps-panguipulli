// Decisiones de permiso que se apartan de como estaba en Base44.
//
// TODAS arrancan apagadas: la migracion mueve el sistema sin cambiar quien ve
// que. Encender una es cambiar el comportamiento a proposito, no arreglarlo de
// paso. Los hallazgos que las motivan estan en PERMISOS.md, con los numeros.
//
// Las de aca son del frontend. Las otras dos viven donde tienen que vivir:
//   - inspecciones por centro (policy)  -> RESTRINGIR_INSPECCIONES_POR_CENTRO
//                                          en migracion/generar_sql.py
//   - inspecciones por centro (backend) -> variable de entorno del mismo nombre
//                                          en el servidor de Railway
export const PERMISOS = {
  // Monitor Corporativo sin poder crear ni editar (salvo comentarios).
  // Apagado: ve botones como "Nuevo Equipo" que la base rechaza al guardar.
  // Encendido: el cliente le bloquea toda escritura de entidades.
  monitorSoloLectura: false,

  // Compra directa (precio, proveedor, boleta) solo para el Jefe de Taller.
  // Apagado: el mecanico tambien puede registrarla, como en Base44.
  // Encendido: el boton "Compra" desaparece para el mecanico.
  compraDirectaSoloJefe: false,
};
