import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Download, Loader2, Database, CheckCircle } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

export default function BackupSection() {
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleExport = async () => {
    setExporting(true);
    setError("");
    try {
      const res = await base44.functions.invoke("exportarBackup");
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const now = new Date();
      const fechaHora = now.toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
      a.download = `backup-sistema_${fechaHora}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch {
      setError("No se pudo generar el respaldo. Intenta nuevamente.");
    }
    setExporting(false);
  };

  if (user?.role !== "super_admin") return null;

  return (
    <div className="bg-white rounded-3xl shadow-lg p-5 lg:p-8 space-y-4">
      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
        <Database className="w-5 h-5 text-blue-500" /> Copia de Seguridad
      </h2>
      <p className="text-sm text-slate-500">
        Descarga un respaldo completo de todos los datos del sistema (equipos, órdenes de trabajo, repuestos, proveedores, usuarios, auditoría, etc.) en un archivo JSON.
        Guarda este archivo en un lugar seguro; permite restaurar la información si algún día se necesita.
      </p>
      <button onClick={handleExport} disabled={exporting}
        className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-colors"
        style={{ background: done ? "#10b981" : "#2563eb" }}>
        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? <CheckCircle className="w-4 h-4" /> : <Download className="w-4 h-4" />}
        {exporting ? "Generando respaldo..." : done ? "¡Respaldo descargado!" : "Descargar respaldo completo"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}