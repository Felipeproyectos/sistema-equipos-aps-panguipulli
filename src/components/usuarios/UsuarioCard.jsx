import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getCentrosEstructura } from "@/lib/centros";
import { Shield, Wrench, Stethoscope, ChevronDown, ChevronUp } from "lucide-react";
import { ROLES, roleLabel, esRolFlota, esSuperAdmin, esRolSalud, rolesQuePuedeCrear, areaDeRol, areaDesalineada } from "@/lib/roles";

const ROLE_COLORS = {
  [ROLES.SUPER_ADMIN]: "#7c3aed",
  [ROLES.ADMIN]: "#2563EB",
  [ROLES.MONITOR_CORPORATIVO]: "#0891b2",
  [ROLES.ENCARGADO_SALUD]: "#059669",
  [ROLES.ENCARGADO_COMPRAS_SALUD]: "#0d9488",
  [ROLES.ENCARGADO_MOVILIZACION]: "#b45309",
  [ROLES.JEFE_TALLER]: "#ea580c",
  [ROLES.ENCARGADO_COMPRAS_TALLER]: "#c2410c",
  [ROLES.MECANICO]: "#ca8a04",
  [ROLES.USER]: "#64748b",
};

function getCentroPrincipal(u) {
  return u.centro_principal || u.centro_asignado || (Array.isArray(u.centros_asignados) ? u.centros_asignados[0] : "") || "";
}

export default function UsuarioCard({ usuario, currentUser, onUpdated }) {
  const [expandido, setExpandido] = useState(false);
  const [editando, setEditando] = useState(false);
  const [rol, setRol] = useState(usuario.role || ROLES.USER);
  const [centroPrincipal, setCentroPrincipal] = useState(getCentroPrincipal(usuario));
  const [subsedes, setSubsedes] = useState(usuario.subsedes_asignadas || []);
  const [guardando, setGuardando] = useState(false);
  const [centrosList, setCentrosList] = useState([]);
  const [cambiandoAcceso, setCambiandoAcceso] = useState(false);
  const [nombre, setNombre] = useState(usuario.full_name || "");
  const [correo, setCorreo] = useState(usuario.email || "");
  const [avisoAccion, setAvisoAccion] = useState(null);   // {tipo, texto}
  const [ocupado, setOcupado] = useState("");

  useEffect(() => {
    getCentrosEstructura().then(setCentrosList).catch(() => {});
  }, []);

  const isSelf = usuario.id === currentUser?.id;
  const rolesAsignables = rolesQuePuedeCrear(currentUser?.role);

  // Puede editar si es super_admin, o si el rol actual del usuario está dentro
  // de lo que este editor puede crear/gestionar (coherente con la jerarquía).
  const canEdit = !isSelf && (esSuperAdmin(currentUser?.role) || rolesAsignables.includes(usuario.role));
  // Rol y centro se escriben directo en `usuario`, y eso solo lo permiten
  // Base del Sistema y Administrador (policy usuario_escribe + el disparador
  // de migracion/23_quien_asigna_roles.sql). A un Jefe de Taller o a
  // Movilización se les ofrecía el selector y el guardado fallaba: ahora solo
  // ven lo que sí pueden cambiar (nombre y correo, que pasan por el servidor).
  const puedeCambiarRol = esSuperAdmin(currentUser?.role) || currentUser?.role === ROLES.ADMIN;

  const color = ROLE_COLORS[usuario.role] || "#64748b";
  const AreaIcon = esRolFlota(usuario.role) ? Wrench : esRolSalud(usuario.role) ? Stethoscope : Shield;
  const centroActual = getCentroPrincipal(usuario);
  const subsedesDelCentro = centrosList.find((c) => c.nombre === centroPrincipal)?.subsedes || [];

  // Suspender, reactivar y eliminar pasan por el servidor: tocan la cuenta de
  // Supabase Auth, no la ficha. Suspender deja todo el historial en pie y solo
  // cierra la puerta; eliminar se lleva la ficha y la cuenta, y no se deshace.
  const accion = async (nombreAccion, confirmacion) => {
    if (confirmacion && !confirm(confirmacion)) return;
    setOcupado(nombreAccion);
    setAvisoAccion(null);
    try {
      const r = await base44.users[nombreAccion](usuario.email);
      if (nombreAccion === "eliminar") { onUpdated?.(usuario.id, null); return; }
      setAvisoAccion({
        tipo: "ok",
        texto: r?.suspendido ? "Cuenta suspendida: ya no puede entrar." : "Cuenta reactivada: ya puede entrar.",
      });
      onUpdated?.(usuario.id, {});
    } catch (e) {
      setAvisoAccion({ tipo: "error", texto: e?.data?.error || e?.message || "No se pudo completar" });
    } finally {
      setOcupado("");
    }
  };

  const handleGuardar = async () => {
    setGuardando(true);
    setAvisoAccion(null);
    try {
      // El nombre y el correo NO se escriben directo: el correo es el enlace
      // entre la ficha y la cuenta de acceso, y cambiarlo en un solo lado deja
      // a la persona sin rol y sin filas. El servidor cambia los dos.
      const nom = nombre.trim();
      const cor = correo.trim().toLowerCase();
      const cambiaNombre = nom && nom !== (usuario.full_name || "");
      const cambiaCorreo = cor && cor !== (usuario.email || "").toLowerCase();
      if (cambiaNombre || cambiaCorreo) {
        await base44.users.actualizar(usuario.email, {
          ...(cambiaNombre && { full_name: nom }),
          ...(cambiaCorreo && { email_nuevo: cor }),
        });
      }

      // Si cambia el rol, el área guardada tiene que seguirlo: la pantalla de
      // Usuarios mira el área antes que el rol, y un encargado de salud que
      // pasaba a chofer se quedaba en la pestaña Salud. Sin área guardada no
      // se toca — ahí ya manda el rol.
      const corregirArea = usuario.area && (rol !== usuario.role || areaDesalineada(usuario));
      const update = puedeCambiarRol ? {
        role: rol,
        centro_principal: esRolSalud(rol) ? centroPrincipal : "",
        subsedes_asignadas: esRolSalud(rol) ? subsedes : [],
        ...(corregirArea ? { area: areaDeRol(rol) } : {}),
      } : {};
      if (puedeCambiarRol) await base44.entities.User.update(usuario.id, update);
      onUpdated?.(usuario.id, {
        ...update,
        ...(cambiaNombre && { full_name: nom }),
        ...(cambiaCorreo && { email: cor }),
      });
      setEditando(false);
    } catch (e) {
      setAvisoAccion({ tipo: "error", texto: e?.data?.error || e?.message || "No se pudo guardar" });
      console.error(e);
    } finally {
      setGuardando(false);
    }
  };

  const toggleSubsede = (nombre) => {
    setSubsedes((prev) => (prev.includes(nombre) ? prev.filter((c) => c !== nombre) : [...prev, nombre]));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ background: color }}>
            {usuario.full_name?.charAt(0) || usuario.email?.charAt(0) || "U"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{usuario.full_name || "Sin nombre"}</p>
            <p className="text-xs text-slate-400 truncate">{usuario.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: `${color}15`, color }}>
            <AreaIcon className="w-3 h-3" />
            {roleLabel(usuario.role)}
          </span>
          <button onClick={() => setExpandido(!expandido)} className="text-slate-400 hover:text-slate-600">
            {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>


      {expandido && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-50 space-y-3">
          {!editando ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-slate-400 uppercase font-semibold">Centro principal</p>
                  <p className="text-slate-700 font-medium">{centroActual || "—"}</p>
                </div>
                <div>
                  <p className="text-slate-400 uppercase font-semibold">Subsedes</p>
                  <p className="text-slate-700 font-medium">{(usuario.subsedes_asignadas || []).join(", ") || "—"}</p>
                </div>
              </div>
              {canEdit && (
                <button
                  onClick={() => setEditando(true)}
                  className="w-full py-2 rounded-xl text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  {puedeCambiarRol ? "Editar datos, rol y asignación" : "Editar nombre y correo"}
                </button>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500">Nombre</label>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre y apellido"
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Correo</label>
                <input value={correo} onChange={(e) => setCorreo(e.target.value)}
                  type="email" placeholder="correo@ejemplo.com"
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" />
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Cambiarlo también cambia el correo con el que entra al sistema.
                </p>
              </div>
              {puedeCambiarRol ? (
              <div>
                <label className="text-xs font-semibold text-slate-500">Rol</label>
                <select
                  value={rol}
                  onChange={(e) => setRol(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white"
                >
                  {/* Siempre incluir el rol actual aunque el editor no pueda "crearlo",
                      para no perderlo de la vista; solo puede cambiar entre los que
                      su jerarquía le permite asignar. */}
                  {[...new Set([usuario.role, ...rolesAsignables])].map((r) => (
                    <option key={r} value={r} disabled={r !== usuario.role && !rolesAsignables.includes(r)}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </select>
              </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Rol: <strong className="text-slate-700">{roleLabel(usuario.role)}</strong>. El rol y el centro los cambia
                  Base del Sistema o un Administrador.
                </p>
              )}
              {puedeCambiarRol && esRolSalud(rol) && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Centro principal (CESFAM)</label>
                    <select
                      value={centroPrincipal}
                      onChange={(e) => { setCentroPrincipal(e.target.value); setSubsedes([]); }}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white"
                    >
                      <option value="">Sin asignar</option>
                      {centrosList.map((c) => (
                        <option key={c.nombre} value={c.nombre}>{c.nombre}</option>
                      ))}
                    </select>
                  </div>
                  {subsedesDelCentro.length > 0 && (
                    <div>
                      <label className="text-xs font-semibold text-slate-500">Subsedes asignadas</label>
                      <p className="text-xs text-slate-400 mt-0.5">Si no marcas ninguna, solo ve el centro principal</p>
                      <div className="mt-1 max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-1.5 space-y-0.5">
                        {subsedesDelCentro.map((s) => (
                          <label key={s} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer">
                            <input type="checkbox" checked={subsedes.includes(s)} onChange={() => toggleSubsede(s)} className="w-3.5 h-3.5" />
                            <span className="text-xs text-slate-700">{s}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {avisoAccion && (
                <p className={`text-[11px] font-semibold rounded-lg px-3 py-2 ${
                  avisoAccion.tipo === "error" ? "text-red-600 bg-red-50" : "text-green-700 bg-green-50"}`}>
                  {avisoAccion.texto}
                </p>
              )}

              {/* Suspender y eliminar solo para Base del Sistema, y nunca sobre
                  la propia cuenta (el servidor lo vuelve a comprobar). */}
              {esSuperAdmin(currentUser?.role) && (
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Acceso</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => accion("suspender", `¿Suspender a ${usuario.full_name || usuario.email}?\n\nNo podrá entrar, pero se conserva su ficha y todo su historial. Es reversible.`)}
                      disabled={!!ocupado}
                      className="flex-1 py-2 rounded-lg text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 disabled:opacity-50">
                      {ocupado === "suspender" ? "Suspendiendo..." : "Suspender"}
                    </button>
                    <button
                      onClick={() => accion("reactivar")}
                      disabled={!!ocupado}
                      className="flex-1 py-2 rounded-lg text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 disabled:opacity-50">
                      {ocupado === "reactivar" ? "Reactivando..." : "Reactivar"}
                    </button>
                  </div>
                  <button
                    onClick={() => accion("eliminar", `¿Eliminar a ${usuario.full_name || usuario.email}?\n\nSe borra su ficha y su cuenta de acceso. NO se puede deshacer.\n\nSi solo quieres que deje de entrar, usa Suspender.`)}
                    disabled={!!ocupado}
                    className="w-full py-2 rounded-lg text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 disabled:opacity-50">
                    {ocupado === "eliminar" ? "Eliminando..." : "Eliminar cuenta"}
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setEditando(false)} className="flex-1 py-2 rounded-lg text-xs font-semibold text-slate-500 bg-slate-100">
                  Cancelar
                </button>
                <button
                  onClick={handleGuardar}
                  disabled={guardando}
                  className="flex-1 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                  style={{ background: "#2563EB" }}
                >
                  {guardando ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}