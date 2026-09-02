// Barra flotante que solo existe en modo local. Dos cosas:
//  1. Cambiar de usuario (los 18 del respaldo) para ver la app en cada rol.
//  2. Mostrar que llamo a un servicio externo que aca no existe (Storage,
//     Email, Drive) — util para decidir que funciones sobran.
import { useEffect, useState } from 'react';
import { usuariosDisponibles, emailActivo, cambiarUsuario, llamadasSinBackend, borrarDiario, cambiosGuardados, haySesion, cerrarSesion } from './compat';

// El boton "Ingresar" de la pantalla de Bienvenida dispara este selector: es
// lo mas parecido a elegir con que cuenta entras, sin montar un login de verdad.
function SelectorDeCuenta() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const abrir = () => setVisible(true);
    window.addEventListener('local-pedir-cuenta', abrir);
    return () => window.removeEventListener('local-pedir-cuenta', abrir);
  }, []);
  if (!visible) return null;
  const usuarios = usuariosDisponibles();
  return (
    <div
      onClick={() => setVisible(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, padding: 20, width: 420, maxHeight: '80vh', overflow: 'auto', fontFamily: 'ui-sans-serif, system-ui' }}>
        <p style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', margin: 0 }}>Entrar como</p>
        <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 12px' }}>
          Modo local: elige una cuenta con la que entrar.
        </p>
        {usuarios.map((u) => (
          <button
            key={u.email}
            onClick={() => cambiarUsuario(u.email)}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 11px', marginBottom: 5, borderRadius: 9, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 13, color: '#0f172a' }}
          >
            <strong>{u.full_name || u.email}</strong>
            <span style={{ color: '#64748b' }}>
              {' — '}{u.role}{u.centro_principal ? ` · ${u.centro_principal}` : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function BarraLocal() {
  const [abierta, setAbierta] = useState(false);
  const [pendientes, setPendientes] = useState([]);
  const usuarios = usuariosDisponibles();
  const actual = emailActivo();

  useEffect(() => {
    const refrescar = () => setPendientes([...llamadasSinBackend]);
    window.addEventListener('local-sin-backend', refrescar);
    return () => window.removeEventListener('local-sin-backend', refrescar);
  }, []);

  const yo = usuarios.find((u) => u.email === actual);

  // Sin sesion solo hace falta el selector: la barra no tiene nada que mostrar.
  if (!haySesion()) return <SelectorDeCuenta />;

  return (
    <div style={{ position: 'fixed', top: 8, right: 8, zIndex: 99999, fontFamily: 'ui-sans-serif, system-ui', fontSize: 12 }}>
      <button
        onClick={() => setAbierta(!abierta)}
        style={{ background: '#0f172a', color: 'white', border: 0, borderRadius: 999, padding: '6px 12px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.25)' }}
      >
        LOCAL · {yo?.role || 'sin usuario'}{pendientes.length ? ` · ${pendientes.length} sin backend` : ''}
      </button>

      {abierta && (
        <div style={{ marginTop: 6, width: 340, background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, boxShadow: '0 8px 24px rgba(0,0,0,.18)', maxHeight: '80vh', overflow: 'auto' }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: '#0f172a' }}>Ver la app como</div>
          <select
            value={actual || ''}
            onChange={(e) => cambiarUsuario(e.target.value)}
            style={{ width: '100%', padding: 6, border: '1px solid #cbd5e1', borderRadius: 8 }}
          >
            {usuarios.map((u) => (
              <option key={u.email} value={u.email}>
                {u.full_name || u.email} — {u.role}{u.centro_principal ? ` · ${u.centro_principal}` : ''}
              </option>
            ))}
          </select>
          <p style={{ color: '#64748b', marginTop: 8, lineHeight: 1.4 }}>
            Cambiar de usuario recarga la pagina, pero lo que crees o edites se
            conserva: asi puedes seguir un flujo entre roles (el mecanico
            solicita, el jefe aprueba, compras compra).
          </p>
          <button
            onClick={borrarDiario}
            style={{ marginTop: 6, width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer', fontSize: 12 }}
          >
            Volver a los datos originales ({cambiosGuardados()} cambios guardados)
          </button>
          <button
            onClick={cerrarSesion}
            style={{ marginTop: 6, width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', color: '#334155', cursor: 'pointer', fontSize: 12 }}
          >
            Cerrar sesion (volver a la pantalla de inicio)
          </button>

          <div style={{ fontWeight: 700, margin: '12px 0 6px', color: '#0f172a' }}>
            Llamadas sin backend ({pendientes.length})
          </div>
          {pendientes.length === 0 ? (
            <p style={{ color: '#64748b' }}>Nada todavia. Aparece aca cuando una pantalla pide Storage, Email o Drive.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 16, color: '#334155' }}>
              {pendientes.map((l, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  <strong>{l.servicio}</strong> · {l.detalle} <span style={{ color: '#94a3b8' }}>{l.hora}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <SelectorDeCuenta />
    </div>
  );
}
