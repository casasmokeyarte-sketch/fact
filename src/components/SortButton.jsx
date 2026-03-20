export function SortButton({ label, sortKey, sortConfig, onChange }) {
  const active = sortConfig?.key === sortKey;
  const direction = active ? sortConfig?.direction : null;

  return (
    <button
      type="button"
      className={`sort-button ${active ? 'active' : ''}`}
      onClick={() => onChange?.(sortKey)}
      title={
        active
          ? `Orden: ${direction === 'asc' ? 'A-Z (menor a mayor)' : 'Z-A (mayor a menor)'}`
          : 'Ordenar A-Z / Z-A'
      }
    >
      <span className="sort-label">{label}</span>
      <span className="sort-arrows" aria-hidden="true">
        <span className={`arrow up ${active && direction === 'asc' ? 'on' : ''}`}>▲</span>
        <span className={`arrow down ${active && direction === 'desc' ? 'on' : ''}`}>▼</span>
      </span>
    </button>
  );
}

