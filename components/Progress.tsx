"use client";

import type { ParseProgress } from "@/lib/types";

interface ProgressProps {
  progress: ParseProgress | null;
  isLoading: boolean;
}

export default function Progress({ progress, isLoading }: ProgressProps) {
  if (!isLoading) return null;

  const percent =
    progress?.totalPages && progress.totalPages > 0
      ? Math.min(
          100,
          Math.round((progress.currentPage / progress.totalPages) * 100)
        )
      : null;

  return (
    <div className="rounded-xl border border-wb-purple/20 bg-wb-light p-6">
      <div className="flex items-center gap-4">
        <div className="relative h-10 w-10 shrink-0">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-wb-purple/20 border-t-wb-purple" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-gray-900">
            {progress?.status ?? "Загрузка..."}
          </p>
          {progress && (
            <p className="mt-1 text-sm text-gray-600">
              Страница {progress.currentPage}
              {progress.totalPages ? ` из ${progress.totalPages}` : ""}
              {" · "}
              Найдено {progress.productsFound} товаров...
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-wb-purple/10">
        {percent !== null ? (
          <div
            className="h-full rounded-full bg-wb-purple transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-wb-purple/60" />
        )}
      </div>
    </div>
  );
}
