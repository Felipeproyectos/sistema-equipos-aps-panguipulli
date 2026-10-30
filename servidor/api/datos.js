// Lo que la API de integración necesita de la base, sobre Supabase con la
// llave de servicio.
//
// Está aparte de la API para poder probarla sin Supabase (api.test.js le pasa
// un doble en memoria con estos mismos métodos). La llave de servicio se salta
// RLS: la API decide antes quién puede escribir qué, y los disparadores de la
// base siguen aplicando sus reglas igual.
import { createClient } from '@supabase/supabase-js';

const TIPOS_VEHICULO = ['ambulancia', 'camioneta', 'furgon', 'camion_3_4'];

// PostgREST arma un `in (...)` dentro de la URL: de a 50 cabe holgado.
const TROZO = 50;

export class ErrorBase extends Error {
  constructor(error) {
    super(error?.message || 'Error de base de datos');
    this.codigo = error?.code || '';
  }
}

function desempacar({ data, error }) {
  if (error) throw new ErrorBase(error);
  return data;
}

export function crearDatosSupabase({ url, llaveServicio }) {
  const db = createClient(url, llaveServicio, { auth: { persistSession: false, autoRefreshToken: false } });

  return {
    async buscarCliente(prefijo) {
      return desempacar(await db.from('api_cliente')
        .select('id,nombre,prefijo,clave_hash,alcances,centros,todos_los_centros,limite_por_minuto,activo,expira')
        .eq('prefijo', prefijo).maybeSingle());
    },

    async vehiculos() {
      return desempacar(await db.from('equipo')
        .select('id,patente,tipo,marca,modelo,centro_principal,subsede,activo')
        .in('tipo', TIPOS_VEHICULO)
        .not('is_sample', 'is', true)
        .order('patente')
        .limit(2000)) || [];
    },

    /** Map(id_externo → id) de los que ese cliente ya mandó a esa tabla. */
    async existentes(tabla, clienteId, idsExternos) {
      const encontrados = new Map();
      for (let i = 0; i < idsExternos.length; i += TROZO) {
        const filas = desempacar(await db.from(tabla)
          .select('id,id_externo')
          .eq('api_cliente_id', clienteId)
          .in('id_externo', idsExternos.slice(i, i + TROZO))) || [];
        for (const f of filas) encontrados.set(f.id_externo, f.id);
      }
      return encontrados;
    },

    async insertar(tabla, fila) {
      return desempacar(await db.from(tabla).insert(fila).select('id').single()).id;
    },

    async consultar(tabla, columnas, clienteId, idExterno) {
      return desempacar(await db.from(tabla).select(columnas)
        .eq('api_cliente_id', clienteId).eq('id_externo', idExterno).maybeSingle());
    },

    async registrar(entrada) {
      desempacar(await db.from('api_registro').insert(entrada));
    },

    async marcarUso(clienteId, fecha) {
      desempacar(await db.from('api_cliente').update({ ultimo_uso: fecha }).eq('id', clienteId));
    },

    async purgarRegistro(antesDe) {
      const { error, count } = await db.from('api_registro').delete({ count: 'exact' }).lt('fecha', antesDe);
      if (error) throw new ErrorBase(error);
      return count || 0;
    },
  };
}
