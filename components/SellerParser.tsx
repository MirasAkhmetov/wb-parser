"use client";

import { useState } from "react";
import ProductList from "@/components/ProductList";
import Progress from "@/components/Progress";
import type { ParseProgress, WbProduct } from "@/lib/types";

export default function SellerParser() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<ParseProgress | null>(null);
  const [products, setProducts] = useState<WbProduct[]>([]);
  const [sellerId, setSellerId] = useState("");
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Ошибка сервера.");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Не удалось получить ответ сервера.");

      const decoder = new TextDecoder();
      let buffer = "";
      let lastEventAt = Date.now();
      const stallMs = 15000;
      const stallTimer = setInterval(() => {
        if (Date.now() - lastEventAt > stallMs) {
          void reader.cancel();
        }
      }, 1000);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (Date.now() - lastEventAt > stallMs) {
              throw new Error(
                "Сервер не отвечает слишком долго. Попробуйте ещё раз."
              );
            }
            break;
          }

          lastEventAt = Date.now();

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6);
          if (!json) continue;

          try {
            const event = JSON.parse(json);
            if (event.type === "heartbeat") {
              lastEventAt = Date.now();
            } else if (event.type === "progress") {
              lastEventAt = Date.now();
              setProgress({
                currentPage: event.currentPage,
                totalPages: event.totalPages,
                productsFound: event.productsFound,
                status: event.status,
              });
            } else if (event.type === "complete") {
              setProducts(event.products);
              if (event.sellerId) setSellerId(event.sellerId);
              sessionStorage.setItem("wb-last-seller-url", url.trim());
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
      } finally {
        clearInterval(stallTimer);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="seller-url" className="mb-2 block text-sm font-medium text-gray-700">
            Ссылка или ID продавца:
          </label>
          <input
            id="seller-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="552670 или https://www.wildberries.ru/seller/552670"
            required
            disabled={isLoading}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-wb-purple focus:outline-none focus:ring-2 focus:ring-wb-purple/20 disabled:bg-gray-50"
          />
          <p className="mt-1 text-xs text-gray-500">
            Можно вставить ссылку с сайта WB, из кабинета или просто ID продавца.
          </p>
        </div>

        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="w-full cursor-pointer rounded-lg bg-wb-purple px-6 py-3 font-medium text-white transition hover:bg-wb-purple-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Загрузка..." : "Получить товары"}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      <Progress progress={progress} isLoading={isLoading} />

      {products.length > 0 && !isLoading && (
        <ProductList products={products} sellerId={sellerId} showFlags={false} />
      )}
    </div>
  );
}
