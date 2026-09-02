// Reemplazo de compat.js en las compilaciones que NO son de modo local.
//
// base44Client.js y BarraLocal.jsx importan el modo local de forma estatica, asi
// que sin esto el bundler arrastraba datos.json — 1,2 MB con los correos de los
// funcionarios y el inventario real — a un bundle publico. Vite apunta aca
// cuando VITE_MODO no es 'local' (ver vite.config.js).
//
// Mismos nombres exportados que compat.js, todos inertes.
export const clienteLocal = null;
export const llamadasSinBackend = [];

export const tablaDe = () => [];
export const reiniciar = () => {};
export const usuariosDisponibles = () => [];
export const emailActivo = () => null;
export const haySesion = () => false;
export const cambiarUsuario = () => {};
export const cerrarSesion = () => {};
export const pedirCuenta = () => {};
export const borrarDiario = () => {};
export const cambiosGuardados = () => 0;

export function createClientFromRequest() {
  throw new Error('El modo local no esta disponible en esta compilacion');
}
