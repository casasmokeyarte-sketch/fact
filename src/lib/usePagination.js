import { useEffect, useMemo, useState } from 'react';

export function usePagination(items, pageSize = 15) {
  const safeItems = Array.isArray(items) ? items : [];
  const [page, setPage] = useState(1);

  const totalItems = safeItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    setPage(1);
  }, [totalItems, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return safeItems.slice(start, start + pageSize);
  }, [safeItems, page, pageSize]);

  return {
    page,
    setPage,
    pageSize,
    totalItems,
    totalPages,
    startItem: totalItems === 0 ? 0 : ((page - 1) * pageSize) + 1,
    endItem: Math.min(page * pageSize, totalItems),
    pageItems,
  };
}
