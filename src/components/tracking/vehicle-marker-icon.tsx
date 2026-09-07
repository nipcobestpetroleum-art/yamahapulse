import L from "leaflet";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&";
      case "<":
        return "<";
      case ">":
        return ">";
      case "&quot;":
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export function createVehicleMarkerIcon(opts: {
  courseDeg: number | null;
  speedKmh: number | null;
  isOffline: boolean;
}) {
  const { courseDeg, speedKmh, isOffline } = opts;

  const course = courseDeg ?? 0;
  const moving = (speedKmh ?? 0) > 2 && !isOffline;
  const color = isOffline ? "#64748b" : moving ? "#22c55e" : "#38bdf8";

  const html = `
    <div style="
      width:34px;height:34px;border-radius:9999px;
      background:${color};
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 10px 20px rgba(0,0,0,.45);
      border:1px solid rgba(255,255,255,.18);
      transform: rotate(${course}deg);
      transform-origin: center;
    ">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L15 8L12 7L9 8L12 2Z" fill="white"/>
        <path d="M12 7C14.7614 7 17 9.23858 17 12C17 14.7614 14.7614 17 12 17C9.23858 17 7 14.7614 7 12C7 9.23858 9.23858 7 12 7Z" fill="white" opacity=".9"/>
      </svg>
    </div>
  `;

  return L.divIcon({
    className: `vehicle-marker vehicle-marker-${escapeHtml(color.replace("#", ""))}`,
    html,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}