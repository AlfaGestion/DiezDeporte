export default function AdminNotFound() {
  return (
    <main className="admin-shell">
      <section className="admin-pane">
        <div className="admin-pane-header">
          <div>
            <span className="admin-pane-kicker">Admin</span>
            <h2>No encontramos esa seccion</h2>
            <p>La ruta puede haber cambiado o ya no estar disponible dentro del panel.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href="/admin" className="submit-order-button">
            Volver al panel
          </a>
        </div>
      </section>
    </main>
  );
}
