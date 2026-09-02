import { base44 } from "@/api/base44Client";

/**
 * Llama a una función backend sin requerir autenticación de usuario.
 * Usa el SDK de base44 (la forma correcta en esta plataforma).
 */
export async function invokePublic(functionName, payload = {}) {
  const response = await base44.functions.invoke(functionName, payload);
  return response.data;
}