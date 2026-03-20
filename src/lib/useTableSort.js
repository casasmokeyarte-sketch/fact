import { useMemo, useState } from 'react';

function normalizeSortValue(value, type) {
  if (value == null) return type === 'number' || type === 'date' ? 0 : '';

  if (type === 'number') {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  if (type === 'date') {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  return String(value).toLowerCase();
}

function compareValues(a, b, direction = 'asc') {
  const dir = direction === 'desc' ? -1 : 1;
  if (a === b) return 0;
  return a > b ? dir : -dir;
}

/**
 * columns shape:
 * {
 *   key: { getValue?: (row)=>any, type?: 'string'|'number'|'date' }
 * }
 */
export function useTableSort(rows, columns = {}, initialKey = '', initialDirection = 'asc') {
  const [sortConfig, setSortConfig] = useState(() => ({
    key: initialKey || '',
    direction: initialDirection === 'desc' ? 'desc' : 'asc',
  }));

  const setSortKey = (key) => {
    if (!key) return;
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const sortedRows = useMemo(() => {
    const list = Array.isArray(rows) ? [...rows] : [];
    const key = sortConfig.key;
    if (!key || !columns?.[key]) return list;

    const col = columns[key] || {};
    const getValue = typeof col.getValue === 'function' ? col.getValue : (row) => row?.[key];
    const type = col.type || 'string';

    return list.sort((ra, rb) => {
      const va = normalizeSortValue(getValue(ra), type);
      const vb = normalizeSortValue(getValue(rb), type);
      return compareValues(va, vb, sortConfig.direction);
    });
  }, [rows, columns, sortConfig.key, sortConfig.direction]);

  return { sortedRows, sortConfig, setSortKey, setSortConfig };
}
