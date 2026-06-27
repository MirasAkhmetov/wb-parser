import type { Page, Response } from "playwright";
import type {
  ParseCallbacks,
  ParseResult,
  TrademarkOptions,
  WbProduct,
} from "./types";
import { ParseError } from "./types";
import {
  isBlockedPageContent,
  waitForAntiBot,
  withWbPage,
} from "./browser";
import {
  buildCatalogUrls,
  fetchCatalogPageDirect,
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

async function fetchCatalogPage(
  page: Page,
  sellerId: string,
  pageNum: number
): Promise<WbCatalogResponse> {
  const urls = buildCatalogUrls(sellerId, pageNum);
  const referer = `https://www.wildberries.ru/seller/${sellerId}`;
  let lastStatus = 0;

  for (const apiUrl of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await page.evaluate(
          async ({ url, ref }) => {
            const response = await fetch(url, {
              headers: {
                Accept: "application/json, text/plain, */*",
                Referer: ref,
              },
              credentials: "include",
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
          },
          { url: apiUrl, ref: referer }
        );

        if (!result.error) {
          return { products: result.products, total: result.total };
        }
        lastStatus = result.status;
      } catch {
        await page.waitForTimeout(1000);
      }
    }
  }

  if (lastStatus === 403 || lastStatus === 429) {
    throw new ParseError(
      "Сайт блокирует автоматический доступ. Попробуйте через 10–15 минут или с другого интернета.",
      "BLOCKED"
    );
  }

  throw new ParseError("Не удалось получить данные каталога.", "UNAVAILABLE");
}

async function warmSellerSession(
  page: Page,
  sellerId: string
): Promise<WbCatalogResponse | null> {
  const sellerUrl = `https://www.wildberries.ru/seller/${sellerId}`;
  const state: { captured: WbCatalogResponse | null } = { captured: null };

  const onResponse = async (response: Response) => {
    const url = response.url();
    if (!url.includes("catalog") || response.status() !== 200) return;

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
    await page.goto(sellerUrl, {
      waitUntil: "domcontentloaded",
      timeout: SELLER_PAGE_TIMEOUT,
    });

    await waitForAntiBot(page, 15000);
    await page.waitForTimeout(2000);

    try {
      await page.waitForSelector("article.product-card", { timeout: 25000 });
    } catch {
      // cards may load later; network capture may still work
    }

    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(2000);

    if (state.captured?.products?.length) {
      return state.captured;
    }
  } catch {
    // navigation errors are ok if data was captured
  } finally {
    page.off("response", onResponse);
  }

  return state.captured;
}

async function loadFirstCatalogPage(
  page: Page,
  sellerId: string,
  onStatus: (status: string) => void
): Promise<WbCatalogResponse> {
  onStatus("Открываем страницу продавца...");
  const captured = await warmSellerSession(page, sellerId);
  if (captured?.products?.length || (captured?.total ?? 0) > 0) {
    return captured!;
  }

  onStatus("Загружаем каталог товаров...");
  try {
    return await fetchCatalogPage(page, sellerId, 1);
  } catch (error) {
    if (error instanceof ParseError && error.code === "BLOCKED") {
      const content = await page.content();
      if (isBlockedPageContent(content)) throw error;
    }
    throw error;
  }
}

async function parseSellerCatalog(
  sellerId: string,
  onProgress: ParseCallbacks["onProgress"],
  fetchPage: (pageNum: number) => Promise<WbCatalogResponse>
): Promise<{ allProducts: WbProduct[]; totalPages: number }> {
  const allProducts: WbProduct[] = [];

  const reportProgress = (
    currentPage: number,
    totalPages: number | null,
    status: string
  ) => {
    onProgress?.({
      currentPage,
      totalPages,
      productsFound: allProducts.length,
      status,
    });
  };

  reportProgress(1, null, "Загружаем каталог товаров...");

  const firstPage = await fetchPage(1);
  const total = firstPage.total ?? 0;

  if (!firstPage.products?.length && total === 0) {
    throw new ParseError("Товары не найдены.", "NOT_FOUND");
  }

  const totalPages = Math.max(1, Math.ceil(total / PRODUCTS_PER_PAGE));

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    reportProgress(
      pageNum,
      totalPages,
      `Страница ${pageNum} из ${totalPages} — загрузка...`
    );

    const catalogData = pageNum === 1 ? firstPage : await fetchPage(pageNum);
    allProducts.push(...(catalogData.products ?? []).map(mapApiProduct));

    reportProgress(
      pageNum,
      totalPages,
      `Найдено ${allProducts.length} из ${total} товаров...`
    );

    if (!catalogData.products?.length) break;
    if (pageNum >= totalPages) break;
    if (pageNum > 1) await new Promise((r) => setTimeout(r, 200));
  }

  return { allProducts, totalPages };
}

function finalizeParseResult(
  sellerId: string,
  allProducts: WbProduct[],
  totalPages: number,
  trademarkOptions: TrademarkOptions
): ParseResult {
  const uniqueProducts = dedupeAndSort(allProducts);
  const { products, flaggedCount } = applyTrademarkFlags(
    uniqueProducts,
    trademarkOptions
  );

  if (products.length === 0) {
    throw new ParseError("Товары не найдены.", "NOT_FOUND");
  }

  return {
    products,
    totalPages,
    sellerId,
    flaggedCount,
  };
}

async function parseWildberriesSellerViaApi(
  sellerId: string,
  callbacks: ParseCallbacks,
  trademarkOptions: TrademarkOptions
): Promise<ParseResult> {
  const { allProducts, totalPages } = await parseSellerCatalog(
    sellerId,
    callbacks.onProgress,
    (pageNum) => fetchCatalogPageDirect(sellerId, pageNum)
  );

  callbacks.onProgress?.({
    currentPage: totalPages,
    totalPages,
    productsFound: allProducts.length,
    status: `Готово! Найдено ${allProducts.length} товаров.`,
  });

  return finalizeParseResult(sellerId, allProducts, totalPages, trademarkOptions);
}

export async function parseWildberriesSeller(
  sellerUrl: string,
  callbacks: ParseCallbacks = {},
  trademarkOptions: TrademarkOptions = {}
): Promise<ParseResult> {
  const parsed = validateSellerInput(sellerUrl);
  const sellerId = parsed.sellerId;
  const { onProgress } = callbacks;

  if (process.env.VERCEL) {
    try {
      return await parseWildberriesSellerViaApi(
        sellerId,
        callbacks,
        trademarkOptions
      );
    } catch (error) {
      if (
        error instanceof ParseError &&
        (error.code === "BLOCKED" || error.code === "NOT_FOUND")
      ) {
        throw error;
      }
      // API недоступен с серверов Vercel — пробуем браузер как запасной вариант
    }
  }

  return withWbPage(async (page) => {
    onProgress?.({
      currentPage: 1,
      totalPages: null,
      productsFound: 0,
      status: "Подключаемся к Wildberries...",
    });

    const firstPage = await loadFirstCatalogPage(page, sellerId, (status) =>
      onProgress?.({
        currentPage: 1,
        totalPages: null,
        productsFound: 0,
        status,
      })
    );

    const total = firstPage.total ?? 0;
    if (!firstPage.products?.length && total === 0) {
      throw new ParseError("Товары не найдены.", "NOT_FOUND");
    }

    const totalPages = Math.max(1, Math.ceil(total / PRODUCTS_PER_PAGE));
    const allProducts: WbProduct[] = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      onProgress?.({
        currentPage: pageNum,
        totalPages,
        productsFound: allProducts.length,
        status: `Страница ${pageNum} из ${totalPages} — загрузка...`,
      });

      const catalogData =
        pageNum === 1
          ? firstPage
          : await fetchCatalogPage(page, sellerId, pageNum);

      allProducts.push(...(catalogData.products ?? []).map(mapApiProduct));

      onProgress?.({
        currentPage: pageNum,
        totalPages,
        productsFound: allProducts.length,
        status: `Найдено ${allProducts.length} из ${total} товаров...`,
      });

      if (!catalogData.products?.length) break;
      if (pageNum >= totalPages) break;
      await page.waitForTimeout(400);
    }

    onProgress?.({
      currentPage: totalPages,
      totalPages,
      productsFound: allProducts.length,
      status: `Готово! Найдено ${allProducts.length} товаров.`,
    });

    return finalizeParseResult(
      sellerId,
      allProducts,
      totalPages,
      trademarkOptions
    );
  });
}