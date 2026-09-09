import React from "react";

// Sin esto, un error de render en cualquier pantalla desmonta todo el arbol y
// deja la ventana en blanco (o negra, si el sistema esta en modo oscuro) sin
// forma de volver atras. Es el "se va a negro y no se puede hacer nada mas".
export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Error de pantalla:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 max-w-lg w-full" style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
          <h1 className="text-lg font-bold text-slate-800 mb-1">Esta pantalla falló</h1>
          <p className="text-sm text-slate-500 mb-4">
            El resto del sistema sigue funcionando. Vuelve atrás o recarga.
          </p>
          <pre className="text-xs text-red-600 bg-red-50 rounded-xl p-3 mb-4 whitespace-pre-wrap break-words max-h-48 overflow-auto">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={() => { this.setState({ error: null }); window.history.back(); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600"
              style={{ background: "#F1F5F9" }}>
              Volver
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ background: "#2563EB" }}>
              Recargar
            </button>
          </div>
        </div>
      </div>
    );
  }
}
