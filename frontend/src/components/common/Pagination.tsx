import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginationMeta } from '../../types';

interface PaginationProps {
  meta?: PaginationMeta;
  currentPage: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  meta,
  currentPage,
  onPageChange,
}) => {
  const totalPages = meta?.totalPages || meta?.pages || 1;
  const totalCount = meta?.totalCount ?? meta?.total ?? 0;

  if (totalPages <= 1 && totalCount <= 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-3 px-4 text-xs text-[#525252] bg-[#f4f4f4] border-t border-[#e0e0e0] font-['IBM_Plex_Sans',sans-serif]">
      <div className="font-medium">
        {totalCount > 0 ? (
          <span>
            Total <strong className="text-[#161616] font-semibold font-mono">{totalCount}</strong> items
            {totalPages > 1 && ` · Page ${currentPage} of ${totalPages}`}
          </span>
        ) : (
          `Page ${currentPage} of ${totalPages}`
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="flex items-center gap-1 px-3 py-1 rounded-none border border-[#8d8d8d] text-xs font-medium text-[#161616] bg-white hover:bg-[#e5e5e5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Previous
        </button>

        <span className="px-2 text-xs font-semibold font-mono text-[#161616]">
          {currentPage} / {totalPages}
        </span>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="flex items-center gap-1 px-3 py-1 rounded-none border border-[#8d8d8d] text-xs font-medium text-[#161616] bg-white hover:bg-[#e5e5e5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
