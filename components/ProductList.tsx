"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import type { WbProduct } from "@/lib/types";

interface ProductListProps {
  products: WbProduct[];
  sellerId?: string;
  showFlags?: boolean;
  excelPrefix?: string;
}

export default function ProductList({
  products,
  sellerId,
  showFlags = true,
  excelPrefix = "wildberries",
}: ProductListProps) {
  const [copied, setCopied] = useState(false);
  const flaggedCount = products.filter((p) => p.isFlagged).length;

  const handleCopyArticles = async () => {
    const text = products.map((p) => p.article).join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadExcel = () => {
    const rows = products.map((p, i) => ({
      "№": i + 1,
      Артикул: p.article,
      Название: p.title,
      Бренд: p.brand,
      Цена: p.price,
      Продавец: p.supplier ?? "",
      "ID продавца": p.supplierId ?? "",
      "Доставка (ч)": p.deliveryHours ?? "",
      Рейтинг: p.rating,
      Отзывы: p.reviews,
      "Риск / обращение": p.isFlagged ? p.flagLabel ?? "Да" : "",
      Правообладатель: p.rightsHolder ?? "",
      Ссылка: p.url,
      Изображение: p.image,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Товары");

    const date = new Date().toISOString().slice(0, 10);
    const filename = sellerId
      ? `${excelPrefix}-seller-${sellerId}-${date}.xlsx`
      : `${excelPrefix}-products-${date}.xlsx`;

    XLSX.writeFile(workbook, filename);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-gray-900">
            Найдено товаров:{" "}
            <span className="text-wb-purple">{products.length}</span>
          </p>
          {showFlags && flaggedCount > 0 && (
            <p className="mt-1 text-sm font-medium text-red-600">
              Выделено рисковых / с обращением: {flaggedCount}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleCopyArticles}
            className="rounded-lg border border-wb-purple/30 bg-white px-4 py-2 text-sm font-medium text-wb-purple transition hover:bg-wb-light"
          >
            {copied ? "Скопировано!" : "Копировать артикулы"}
          </button>
          <button
            type="button"
            onClick={handleDownloadExcel}
            className="rounded-lg bg-wb-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-wb-purple-dark"
          >
            Скачать Excel
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {products.map((product, index) => (
          <div
            key={`${product.article}-${index}`}
            className={`rounded-xl border p-5 shadow-sm ${
              product.isFlagged
                ? "border-red-300 bg-red-50"
                : "border-gray-200 bg-white"
            }`}
          >
            {product.isFlagged && (
              <div className="mb-3 inline-flex rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                {product.flagLabel}
              </div>
            )}

            <div className="flex gap-4">
              {product.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image}
                  alt={product.title}
                  className="h-20 w-20 shrink-0 rounded-lg object-cover"
                  loading="lazy"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-500">{index + 1}.</p>

                <p className="mt-1 text-sm text-gray-500">Артикул:</p>
                <p
                  className={`font-mono font-semibold ${
                    product.isFlagged ? "text-red-700" : "text-wb-purple"
                  }`}
                >
                  {product.article}
                </p>

                <p className="mt-2 text-sm text-gray-500">Название:</p>
                <p className="font-medium text-gray-900">{product.title}</p>

                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  {product.brand && (
                    <span className="text-gray-600">{product.brand}</span>
                  )}
                  {product.price && (
                    <span className="font-semibold text-wb-purple">
                      {product.price}
                    </span>
                  )}
                  {product.supplier && (
                    <span className="text-gray-600">{product.supplier}</span>
                  )}
                  {product.deliveryHours ? (
                    <span className="text-gray-500">
                      Доставка: ~{product.deliveryHours} ч
                    </span>
                  ) : null}
                  {product.rating && (
                    <span className="text-gray-500">
                      ★ {product.rating}
                      {product.reviews ? ` (${product.reviews})` : ""}
                    </span>
                  )}
                </div>

                {product.isFlagged && product.rightsHolder && (
                  <p className="mt-2 text-sm font-medium text-red-700">
                    Правообладатель: {product.rightsHolder}
                  </p>
                )}

                <p className="mt-2 text-sm text-gray-500">Ссылка:</p>
                <a
                  href={product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm text-blue-600 hover:underline"
                >
                  {product.url}
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
