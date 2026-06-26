"use client";

import { useEffect, useState } from "react";
import ProductList from "@/components/ProductList";
import Progress from "@/components/Progress";
import { RIGHTS_DATABASE } from "@/lib/rights-database";
import type { ParseProgress, WbProduct } from "@/lib/types";

export default function ComplaintsParser() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<ParseProgress | null>(null);
  const [products, setProducts] = useState<WbProduct[]>([]);
  const [sellerId, setSellerId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("wb-last-seller-url");
    if (saved) setUrl(saved);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setProducts([]);
    setSellerId("");
    setProgress(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/wildberries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          useRightsDatabase: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Ошибка сервера.");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Не удалось получить ответ сервера.");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6);
          if (!json) continue;

          try {
            const event = JSON.parse(json);
            if (event.type === "progress") {
              setProgress({
                currentPage: event.currentPage,
                totalPages: event.totalPages,
                productsFound: event.productsFound,
                status: event.status,
              });
            } else if (event.type === "complete") {
              const flagged = (event.products as WbProduct[]).filter(
                (p) => p.isFlagged && p.flagReason === "database"
              );
              setProducts(flagged);
              if (event.sellerId) setSellerId(event.sellerId);

              if (flagged.length === 0) {
                setError(
                  "По базе правообладателей совпадений не найдено. Товары продавца не содержат известных защищённых брендов."
                );
              }
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== json) {
              throw parseErr;
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        Автоматическая проверка товаров продавца по базе защищённых брендов
        (товарные знаки правообладателей). Совпадающие артикулы выделяются
        красным.
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="mb-2 text-sm font-medium text-gray-700">База брендов:</p>
        <div className="flex flex-wrap gap-2">
          {RIGHTS_DATABASE.map((brand) => (
            <span
              key={brand.id}
              className="rounded-full bg-wb-light px-3 py-1 text-xs text-wb-purple"
            >
              {brand.legalName}
            </span>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="complaints-seller-url" className="mb-2 block text-sm font-medium text-gray-700">
            Ссылка или ID продавца:
          </label>
          <input
            id="complaints-seller-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="552670 или https://www.wildberries.ru/seller/552670"
            required
            disabled={isLoading}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-wb-purple focus:outline-none focus:ring-2 focus:ring-wb-purple/20 disabled:bg-gray-50"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="w-full cursor-pointer rounded-lg bg-red-600 px-6 py-3 font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Проверка по базе..." : "Найти артикулы по базе ТМ"}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      <Progress progress={progress} isLoading={isLoading} />

      {products.length > 0 && !isLoading && (
        <ProductList
          products={products}
          sellerId={sellerId}
          showFlags
          excelPrefix="complaints"
        />
      )}
    </div>
  );
}
