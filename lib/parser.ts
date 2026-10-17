import type { Page, Response } from "playwright";
import type {
  ParseCallbacks,
  ParseResult,
  TrademarkOptions,
  WbProduct,
} from "./types";
import { ParseError } from "./types";
import { blockedError, waitForAntiBot, withWbPage } from "./browser";
import {
  PAGE_DELAY_MS,
  type WbApiProduct,
  type WbCatalogResponse,
} from "./catalog-fetch";
import { validateSellerInput } from "./seller-url";
import { applyTrademarkFlags } from "./trademark";
import {
  formatPrice,
  getImageUrl,
  getPriceValue,
} from "./wb-utils";

const SELLER_PAGE_TIMEOUT = 60000;
const PRODUCTS_PER_PAGE = 100;

/** Готовый каталог продавца переиспользуем, а не парсим заново при каждом запросе */
const RESULT_CACHE_TTL_MS = 15 * 60_000;
const resultCache = new Map<
  string,
  { expiresAt: number; products: WbProduct[]; totalPages: number }
>();

const BLOCK_STATUSES = new Set([403, 498]);

function getProductPrice(product: WbApiProduct): {
  label: string;
  value: number;
} {
  const size = product.sizes?.[0];
  if (!size?.price) return { label: "", value: 0 };
  const sale = formatPrice(size.price.product);
  const basic = formatPrice(size.price.basic);
  const value = getPriceValue(size.price.product);
  if (sale && basic && sale !== basic) {
    return { label: `${sale} (было ${basic})`, value };
  }
  return { label: sale || basic, value };
}

function mapApiProduct(product: WbApiProduct): WbProduct {
  const article = String(product.id);
  const { label, value } = getProductPrice(product);
  const deliveryHours = (product.time1 ?? 0) + (product.time2 ?? 0);

  return {
    article,
    title: product.name?.trim() ?? "",
    url: `https://www.wildberries.ru/catalog/${article}/detail.aspx`,
    price: label,
    priceValue: value,
    brand: product.brand?.trim() ?? "",
    category: product.subjectId ? String(product.subjectId) : "",
    image: getImageUrl(product.id),
    rating: product.rating ? String(product.rating) : "",
    reviews: product.feedbacks ? String(product.feedbacks) : "",
    supplier: product.supplier?.trim() ?? "",
    supplierId: product.supplierId ? String(product.supplierId) : "",
    deliveryHours: deliveryHours > 0 ? deliveryHours : undefined,
  };
}

function dedupeAndSort(products: WbProduct[]): WbProduct[] {
  const map = new Map<string, WbProduct>();
  for (const product of products) {
    if (!map.has(product.article)) {
      map.set(product.article, product);
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.title.localeCompare(b.title, "ru", { sensitivity: "base" })
  );
}

async function scrapeSellerProductsFromDom(page: Page): Promise<WbApiProduct[]> {
  return page.evaluate(() => {
    const cards = document.querySelectorAll("article.product-card");
    const products: Array<{
      id: number;
      name: string;
      brand?: string;
      sizes?: Array<{ price?: { product?: number } }>;
    }> = [];

    cards.forEach((card) => {
      const link = card.querySelector("a[href*='/catalog/']");
      const href = link?.getAttribute("href") ?? "";
      const idMatch = href.match(/\/catalog\/(\d+)/);
      const id = idMatch ? Number(idMatch[1]) : 0;
      if (!id) return;

      const name =
        card.querySelector(".product-card__name, .goods-name")?.textContent?.trim() ??
        "";
      const brand =
        card.querySelector(".product-card__brand, .brand-name")?.textContent?.trim() ??
        "";
      const priceText =
        card.querySelector(".price__lower-price, .price__current")?.textContent ??
        "";
      const priceDigits = priceText.replace(/\D/g, "");
      const priceRub = priceDigits ? Number(priceDigits) : 0;

      products.push({
        id,
        name,
        brand,
        sizes: priceRub ? [{ price: { product: priceRub * 100 } }] : undefined,
      });
    });

    return products;
  });
}

/**
 * Открываем страницу продавца как обычный посетитель и забираем страницу
 * каталога из ответа, который запрашивает сам сайт. Отдельных запросов
 * к API каталога из скрипта не делаем: WB распознаёт их как бота.
 */
async function openSellerPage(
  page: Page,
  sellerId: string,
  pageNum = 1
): Promise<WbCatalogResponse | null> {
  const sellerUrl =
    pageNum > 1
      ? `https://www.wildberries.ru/seller/${sellerId}?page=${pageNum}`
      : `https://www.wildberries.ru/seller/${sellerId}`;
  const state: { captured: WbCatalogResponse | null; blocked: boolean } = {
    captured: null,
    blocked: false,
  };

  const onResponse = async (response: Response) => {
    const url = response.url();
    if (!url.includes("catalog")) return;
    if (BLOCK_STATUSES.has(response.status())) {
      state.blocked = true;
      return;
    }
    if (response.status() !== 200) return;
    // Нужна именно запрошенная страница каталога
    const requestedPage = Number(new URL(url).searchParams.get("page") ?? "1");
    if (requestedPage !== pageNum) return;

    try {
      const data = (await response.json()) as WbCatalogResponse;
      if (data.products?.length) {
        state.captured = {
          products: data.products,
          total: Math.max(data.total ?? 0, data.products.length),
        };
      }
    } catch {
      // ignore
    }
  };

  page.on("response", onResponse);

  try {
    try {
      await page.goto(sellerUrl, {
        waitUntil: "domcontentloaded",
        timeout: SELLER_PAGE_TIMEOUT,
      });
    } catch {
      // навигация могла оборваться после загрузки данных — проверим ниже
    }

    // Пусть браузер сам пройдёт проверку; если не прошла — BLOCKED без повторов
    await waitForAntiBot(page, 20000);

    try {
      await page.waitForSelector("article.product-card", { timeout: 25000 });
    } catch {
      // карточки могут не отрисоваться, но ответ каталога уже перехвачен
    }

    if (!state.captured) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(2000);
    }

    if (!state.captured && state.blocked) throw blockedError();
    return state.captured;
  } finally {
    page.off("response", onResponse);
  }
}

/** Страница каталога: из ответа сайта, а если его не поймали — из DOM */
async function loadCatalogPage(
  page: Page,
  sellerId: string,
  pageNum: number
): Promise<WbCatalogResponse> {
  const captured = await openSellerPage(page, sellerId, pageNum);
  if (captured?.products?.length || (captured?.total ?? 0) > 0) {
    return captured!;
  }

  const domProducts = await scrapeSellerProductsFromDom(page);
  if (domProducts.length > 0) {
    return { products: domProducts, total: domProducts.length };
  }

  throw new ParseError("Не удалось получить данные каталога.", "UNAVAILABLE");
}

function finalizeParseResult(
  sellerId: string,
  allProducts: WbProduct[],
  totalPages: number,
  trademarkOptions: TrademarkOptions,
  options: { partial?: boolean; total?: number } = {}
): ParseResult {
  const uniqueProducts = dedupeAndSort(allProducts);
  const { products, flaggedCount } = applyTrademarkFlags(
    uniqueProducts,
    trademarkOptions
  );

  if (products.length === 0) {
    throw new ParseError("Товары не найдены.", "NOT_FOUND");
  }

  const warning =
    options.partial && options.total
      ? `Загружено ${products.length} из ${options.total} товаров. Wildberries ограничил доступ — попробуйте позже для полного списка.`
      : undefined;

  return {
    products,
    totalPages,
    sellerId,
    flaggedCount,
    partial: options.partial,
    warning,
  };
}

export async function parseWildberriesSeller(
  sellerUrl: string,
  callbacks: ParseCallbacks = {},
  trademarkOptions: TrademarkOptions = {}
): Promise<ParseResult> {
  const parsed = validateSellerInput(sellerUrl);
  const sellerId = parsed.sellerId;
  const { onProgress } = callbacks;

  const cached = resultCache.get(sellerId);
  if (cached && cached.expiresAt > Date.now()) {
    onProgress?.({
      currentPage: cached.totalPages,
      totalPages: cached.totalPages,
      productsFound: cached.products.length,
      status: `Готово! Найдено ${cached.products.length} товаров (из кэша).`,
    });
    return finalizeParseResult(
      sellerId,
      cached.products,
      cached.totalPages,
      trademarkOptions
    );
  }

  onProgress?.({
    currentPage: 0,
    totalPages: null,
    productsFound: 0,
    status: "Открываем страницу продавца...",
  });

  return withWbPage(async (page) => {
    const firstPage = await loadCatalogPage(page, sellerId, 1);

    const total = firstPage.total ?? 0;
    if (!firstPage.products?.length && total === 0) {
      throw new ParseError("Товары не найдены.", "NOT_FOUND");
    }

    const totalPages = Math.max(1, Math.ceil(total / PRODUCTS_PER_PAGE));
    const allProducts: WbProduct[] = [
      ...firstPage.products!.map(mapApiProduct),
    ];
    let partial = false;

    onProgress?.({
      currentPage: 1,
      totalPages,
      productsFound: allProducts.length,
      status: `Найдено ${allProducts.length} из ${total} товаров...`,
    });

    for (let pageNum = 2; pageNum <= totalPages; pageNum++) {
      onProgress?.({
        currentPage: pageNum,
        totalPages,
        productsFound: allProducts.length,
        status: `Страница ${pageNum} из ${totalPages} — загрузка...`,
      });

      await page.waitForTimeout(PAGE_DELAY_MS);

      try {
        const catalogData = await loadCatalogPage(page, sellerId, pageNum);
        if (!catalogData.products?.length) break;

        allProducts.push(...catalogData.products.map(mapApiProduct));
        onProgress?.({
          currentPage: pageNum,
          totalPages,
          productsFound: allProducts.length,
          status: `Найдено ${allProducts.length} из ${total} товаров...`,
        });
      } catch (error) {
        // Уже собранное не теряем: отдаём частичный результат
        partial = true;
        onProgress?.({
          currentPage: pageNum,
          totalPages,
          productsFound: allProducts.length,
          status: `Загружено ${allProducts.length} из ${total} — ${
            error instanceof ParseError && error.code === "BLOCKED"
              ? "Wildberries ограничил доступ к остальным страницам."
              : "остальные страницы не загрузились."
          }`,
        });
        break;
      }
    }

    if (!partial) {
      resultCache.set(sellerId, {
        expiresAt: Date.now() + RESULT_CACHE_TTL_MS,
        products: allProducts,
        totalPages,
      });
    }

    const status = partial
      ? `Частично: ${allProducts.length} из ${total} товаров.`
      : `Готово! Найдено ${allProducts.length} товаров.`;

    onProgress?.({
      currentPage: totalPages,
      totalPages,
      productsFound: allProducts.length,
      status,
    });

    return finalizeParseResult(sellerId, allProducts, totalPages, trademarkOptions, {
      partial,
      total,
    });
  }, { skipWarmup: true });
}
