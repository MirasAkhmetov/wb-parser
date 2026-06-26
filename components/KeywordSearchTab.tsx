"use client";

import { useState } from "react";
import type { SearchSellerResult } from "@/lib/types";

export default function KeywordSearchTab() {
  const [keywords, setKeywords] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchSellerResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSearch = async () => {
    if (!keywords.trim()) {
      setError("Введите ключевые слова для поиска.");
      return;
    }

    setError(null);
    setResults([]);
    setIsLoading(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000);

    try {
      const response = await fetch("/api/wildberries/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords }),
        signal: controller.signal,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Ошибка поиска.");

      setResults(data.results ?? []);

      if (!data.results?.length) {
        setError("Продавцы не найдены. Попробуйте другие ключевые слова.");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Превышено время ожидания. Попробуйте снова.");
      } else {
        setError(err instanceof Error ? err.message : "Неизвестная ошибка.");
      }
    } finally {
      clearTimeout(timeout);
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSearch();
  };

  const handleCopy = async () => {
    const text = results
      .map(
        (item, index) =>
          `${index + 1}. ${item.seller.legalName} | ID: ${item.seller.sellerId} | ${item.seller.sellerUrl}`
      )
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="keywords" className="mb-2 block text-sm font-medium text-gray-700">
            Ключевые слова для поиска:
          </label>
          <textarea
            id="keywords"
            value={keywords}
            onChange={(e) => {
              setKeywords(e.target.value);
              if (error === "Введите ключевые слова для поиска.") {
                setError(null);
              }
            }}
            placeholder={"mary kay, мэри кей, timewise"}
            rows={3}
            disabled={isLoading}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-wb-purple focus:outline-none focus:ring-2 focus:ring-wb-purple/20 disabled:bg-gray-50"
          />
          <p className="mt-1 text-xs text-gray-500">
            Введите одно или несколько слов через запятую или с новой строки.
          </p>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full cursor-pointer rounded-lg bg-wb-purple px-6 py-3 font-medium text-white transition hover:bg-wb-purple-dark disabled:cursor-wait disabled:opacity-70"
        >
          {isLoading ? "Поиск..." : "Найти всех продавцов"}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              Найдено продавцов: <strong>{results.length}</strong>
            </p>
            <button
              type="button"
              onClick={handleCopy}
              className="cursor-pointer rounded-lg border border-wb-purple/30 px-4 py-2 text-sm font-medium text-wb-purple hover:bg-wb-light"
            >
              {copied ? "Скопировано!" : "Копировать список"}
            </button>
          </div>

          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {results.map((item, index) => (
              <div key={item.seller.sellerId} className="px-5 py-4">
                <p className="font-medium text-gray-900">
                  <span className="mr-3 text-sm text-gray-400">{index + 1}.</span>
                  {item.seller.legalName}
                </p>
                <div className="mt-2 space-y-1 pl-8 text-sm text-gray-600">
                  {item.seller.storeName &&
                    item.seller.storeName !== item.seller.legalName && (
                      <p>Магазин: {item.seller.storeName}</p>
                    )}
                  <p>ID: {item.seller.sellerId}</p>
                  <p>Товаров по запросу: {item.products.length}</p>
                  <a
                    href={item.seller.sellerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-wb-purple hover:underline"
                  >
                    {item.seller.sellerUrl}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
