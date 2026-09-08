import Link from "next/link";
export default function NotFound() {
  return (
    <div className="workspace">
      <div className="empty-state">
        <h1>Esta página no está disponible</h1>
        <p>Regresa al portal para consultar las solicitudes de ejemplo.</p>
        <Link
          href="/portal"
          className="inline-flex rounded-lg bg-primary px-5 py-3 text-white"
        >
          Volver al portal
        </Link>
      </div>
    </div>
  );
}
