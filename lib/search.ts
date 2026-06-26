import type { Page } from "playwright";
import type {
  PriceCompareResult,
  SearchSellerResult,
  WbProduct,
} from "./types";
import { ParseError } from "./types";
import { getSellersLegalInfo } from "./seller-info";
import {
  isBlockedPageContent,
  waitForAntiBot,
} from "./browser";
import {
  formatDeliveryHours,
  formatPrice,
  getImageUrl,
  getPriceValue,
} from "./wb-utils";

const SEARCH_PAGE_SIZE = 100;
const MAX_SEARCH_PAGES = 10;
const KEYWORD_SEARCH_PAGES = 10;
const PAGE_LOAD_TIMEOUT = 90000;

interface WbApiProduct {
  id: number;
  name: string;
  brand?: string;
  supplier?: string;
  supplierId?: number;
  subjectId?: number;
  rating?: number;
  feedbacks?: number;
  time1?: number;
  time2?: number;
  sizes?: Array<{
    price?: {
      product?: number;
      basic?: number;
    };
  }>;
}

function mapSearchProduct(product: WbApiProduct): WbProduct {
  const article = String(product.id);
  const priceKopecks = product.sizes?.[0]?.price?.product;
  const deliveryHours = (product.time1 ?? 0) + (product.time2 ?? 0);

  return {
    article,
    title: product.name?.trim() ?? "",
    url: `https://www.wildberries.ru/catalog/${article}/detail.aspx`,
    price: formatPrice(priceKopecks),
    priceValue: getPriceValue(priceKopecks),
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

function buildSearchParams(
  query: string,
  page: number,
  dest: string,
  sort: "popular" | "priceup" | "pricedown"
): URLSearchParams {
  return new URLSearchParams({
    ab_testing: "false",
    appType: "1",
    curr: "rub",
    dest,
    inheritFilters: "false",
    lang: "ru",
    page: String(page),
    query,
    resultset: "catalog",
    sort,
    spp: "30",
    suppressSpellcheck: "false",
  });
}

function buildSearchUrls(
  query: string,
  page: number,
  dest: string,
  sort: "popular" | "priceup" | "pricedown"
): string[] {
  const params = buildSearchParams(query, page, dest, sort).toString();

  return [
    `https://www.wildberries.ru/__internal/u-search/exactmatch/ru/common/v18/search?${params}`,
    `https://u-search.wb.ru/exactmatch/ru/common/v18/search?${params}`,
    `https://search.wb.ru/exactmatch/ru/common/v18/search?${params}`,
  ];
}

async function fetchSearchFromUrl(
  page: Page,
  url: string
): Promise<{
  error: boolean;
  status: number;
  products: WbApiProduct[];
  total: number;
}> {
  return page.evaluate(async (searchUrl) => {
    try {
      const response = await fetch(searchUrl, {
        headers: {
          Accept: "application/json, text/plain, */*",
          Referer: "https://www.wildberries.ru/",
        },
      });
      if (!response.ok) {
        return {
          error: true,
          status: response.status,
          products: [],
          total: 0,
        };
      }
      const data = await response.json();
      return {
        error: false,
        status: response.status,
        products: data.products ?? [],
        total: data.total ?? 0,
      };
    } catch {
      return { error: true, status: 0, products: [], total: 0 };
    }
  }, url);
}

async function openSearchPage(
  page: Page,
  query: string
): Promise<{ products: WbApiProduct[]; total: number }> {
  const searchUrl = `https://www.wildberries.ru/catalog/0/search.aspx?search=${encodeURIComponent(query)}`;
  const captured: WbApiProduct[] = [];
  let capturedTotal = 0;

  const onResponse = async (response: {
    url: () => string;
    status: () => number;
    json: () => Promise<unknown>;
  }) => {
    const url = response.url();
    if (!url.includes("/search") || response.status() !== 200) return;

    try {
      const data = (await response.json()) as {
        products?: WbApiProduct[];
        total?: number;
      };
      if (data.products?.length) {
        captured.push(...data.products);
        capturedTotal = data.total ?? capturedTotal;
      }
    } catch {
      // ignore non-json responses
    }
  };

  page.on("response", onResponse);

  try {
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_LOAD_TIMEOUT,
    });
  } catch {
    page.off("response", onResponse);
    if (captured.length) {
      return { products: captured, total: capturedTotal || captured.length };
    }
    throw new ParseError("Не удалось открыть страницу поиска.", "UNAVAILABLE");
  }

  await waitForAntiBot(page, 15000);

  try {
    await page.waitForSelector("article.product-card", {
      timeout: 30000,
    });
  } catch {
    if (!captured.length) {
      const content = await page.content();
      if (isBlockedPageContent(content)) {
        page.off("response", onResponse);
        throw new ParseError(
          "Сайт блокирует автоматический доступ. Попробуйте через 10–15 минут.",
          "BLOCKED"
        );
      }
    }
  }

  await page.waitForTimeout(1500);
  page.off("response", onResponse);

  return { products: captured, total: capturedTotal || captured.length };
}

async function fetchSearchPage(
  page: Page,
  query: string,
  pageNum: number,
  dest: string,
  sort: "popular" | "priceup" | "pricedown"
): Promise<{ products: WbApiProduct[]; total: number }> {
  const urls = buildSearchUrls(query, pageNum, dest, sort);
  let lastStatus = 0;

  for (const url of urls) {
    const result = await fetchSearchFromUrl(page, url);
    if (!result.error) {
      return { products: result.products, total: result.total };
    }
    lastStatus = result.status;
  }

  if (lastStatus === 403 || lastStatus === 429) {
    throw new ParseError(
      "Сайт блокирует автоматический доступ. Попробуйте через 10–15 минут.",
      "BLOCKED"
    );
  }

  throw new ParseError("Не удалось выполнить поиск.", "UNAVAILABLE");
}

async function scrapeSearchFromDom(page: Page): Promise<WbApiProduct[]> {
  return page.evaluate(() => {
    const cards = document.querySelectorAll("article.product-card");
    const products: Array<{
      id: number;
      name: string;
      brand?: string;
      supplier?: string;
      supplierId?: number;
      sizes?: Array<{ price?: { product?: number; basic?: number } }>;
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
        sizes: priceRub
          ? [{ price: { product: priceRub * 100 } }]
          : undefined,
      });
    });

    return products;
  });
}

export async function searchProducts(
  page: Page,
  query: string,
  dest: string,
  maxPages = MAX_SEARCH_PAGES
): Promise<WbProduct[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new ParseError("Введите поисковый запрос.", "INVALID_URL");
  }

  const captured = await openSearchPage(page, trimmed);

  let first: { products: WbApiProduct[]; total: number };
  if (captured.products.length > 0) {
    first = captured;
  } else {
    try {
      first = await fetchSearchPage(page, trimmed, 1, dest, "popular");
    } catch (error) {
      const domProducts = await scrapeSearchFromDom(page);
      if (!domProducts.length) throw error;
      first = { products: domProducts, total: domProducts.length };
    }
  }

  const totalPages = Math.min(
    maxPages,
    Math.max(1, Math.ceil(first.total / SEARCH_PAGE_SIZE))
  );

  const all: WbProduct[] = first.products.map(mapSearchProduct);

  for (let pageNum = 2; pageNum <= totalPages; pageNum++) {
    try {
      const data = await fetchSearchPage(page, trimmed, pageNum, dest, "popular");
      all.push(...data.products.map(mapSearchProduct));
      if (!data.products.length) break;
    } catch {
      break;
    }
    await page.waitForTimeout(250);
  }

  const unique = new Map<string, WbProduct>();
  for (const product of all) {
    if (!unique.has(product.article)) {
      unique.set(product.article, product);
    }
  }

  const results = Array.from(unique.values());
  if (!results.length) {
    throw new ParseError("Товары по запросу не найдены.", "NOT_FOUND");
  }

  return results;
}

export async function searchSellersByKeywords(
  page: Page,
  keywords: string[],
  dest: string
): Promise<SearchSellerResult[]> {
  const sellerMap = new Map<string, WbProduct[]>();

  for (const keyword of keywords) {
    const products = await searchProducts(page, keyword, dest, KEYWORD_SEARCH_PAGES);
    for (const product of products) {
      if (!product.supplierId) continue;
      const existing = sellerMap.get(product.supplierId) ?? [];
      existing.push(product);
      sellerMap.set(product.supplierId, existing);
    }
  }

  if (sellerMap.size === 0) {
    throw new ParseError("Продавцы по ключевым словам не найдены.", "NOT_FOUND");
  }

  const sellerIds = [...sellerMap.keys()];
  const legalInfos = await getSellersLegalInfo(page, sellerIds);
  const legalMap = new Map(legalInfos.map((info) => [info.sellerId, info]));

  return sellerIds
    .map((sellerId) => {
      const products = sellerMap.get(sellerId) ?? [];
      const seller = legalMap.get(sellerId);
      if (!seller) return null;

      const storeFromProducts = products.find((p) => p.supplier)?.supplier;
      const enrichedSeller =
        seller.legalName === `Продавец ${sellerId}` && storeFromProducts
          ? {
              ...seller,
              storeName: storeFromProducts,
              legalName: storeFromProducts,
            }
          : seller;

      const minPrice = Math.min(
        ...products.map((p) => p.priceValue || Infinity)
      );

      return {
        seller: enrichedSeller,
        products,
        minPrice: Number.isFinite(minPrice) ? minPrice : 0,
      };
    })
    .filter((item): item is SearchSellerResult => item !== null)
    .sort((a, b) => b.products.length - a.products.length);
}

export async function compareProductPrices(
  page: Page,
  query: string,
  dest: string,
  cityLabel: string
): Promise<PriceCompareResult> {
  const products = await searchProducts(page, query, dest, MAX_SEARCH_PAGES);

  if (!products.length) {
    throw new ParseError("Товары по запросу не найдены.", "NOT_FOUND");
  }

  const withPrice = products.filter((p) => p.priceValue > 0);
  const prices = withPrice.map((p) => p.priceValue);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = Math.round(
    prices.reduce((sum, price) => sum + price, 0) / prices.length
  );

  const cheapest = [...withPrice].sort(
    (a, b) => a.priceValue - b.priceValue
  )[0] ?? null;

  const fastestDelivery = [...withPrice]
    .filter((p) => p.deliveryHours)
    .sort((a, b) => (a.deliveryHours ?? 9999) - (b.deliveryHours ?? 9999))[0] ?? null;

  const sortedProducts = [...withPrice].sort((a, b) => {
    const deliveryDiff = (a.deliveryHours ?? 9999) - (b.deliveryHours ?? 9999);
    if (deliveryDiff !== 0) return deliveryDiff;
    return a.priceValue - b.priceValue;
  });

  return {
    stats: {
      query,
      city: cityLabel,
      dest,
      totalFound: products.length,
      analyzed: withPrice.length,
      minPrice,
      maxPrice,
      avgPrice,
      cheapest,
      fastestDelivery,
    },
    products: sortedProducts,
  };
}

export { formatDeliveryHours };
