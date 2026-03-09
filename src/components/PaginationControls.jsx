import React from 'react';

export function PaginationControls({
  page,
  totalPages,
  totalItems,
  pageSize = 15,
  onPageChange,
}) {
  if (totalItems <= pageSize) {
    return (
      <div style={{ marginTop: '0.75rem', color: '#64748b', fontSize: '0.9rem' }}>
        1/{Math.max(1, totalPages)} | {totalItems} resultado(s)
      </div>
    );
  }

  return (
    <div style={{ marginTop: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
      <div style={{ color: '#64748b', fontSize: '0.9rem' }}>
        {page}/{totalPages} | {totalItems} resultado(s)
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button className="btn" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
          Anterior
        </button>
        <button className="btn btn-primary" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
          Siguiente
        </button>
      </div>
    </div>
  );
}
