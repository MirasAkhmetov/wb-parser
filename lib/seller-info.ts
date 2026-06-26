import type { Page } from "playwright";
import type { SellerLegalInfo } from "./types";

const legalNameCache = new Map<string, SellerLegalInfo>();

function extractLegalNameFromText(text: string): string {
  const patterns = [
    /((?:ИП|ООО|ОАО|ЗАО|ПАО|АО|ТОО)\s+[^\n\r]{3,120})/i,
    /((?:Индивидуальный предприниматель)\s+[^\n\r]{3,120})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim().replace(/\s+/g, " ");
    }
  }

  return "";
}

export async function getSellerLegalInfo(
  page: Page,
  sellerId: string
): Promise<SellerLegalInfo> {
  const cached = legalNameCache.get(sellerId);
  if (cached) return cached;

  const endpoints = [
    `https://www.wildberries.ru/webapi/seller/data/short/${sellerId}`,
    `https://www.wildberries.ru/__internal/u-supplier/sellers/v1/info?supplierId=${sellerId}`,
    `https://www.wildberries.ru/__internal/u-supplier/sellers/v2/info?supplierId=${sellerId}`,
  ];

  for (const endpoint of endpoints) {
    const data = await page.evaluate(async (url) => {
      try {
        const response = await fetch(url, {
          headers: {
            Accept: "application/json, text/plain, */*",
            Referer: "https://www.wildberries.ru/",
          },
        });
        if (!response.ok) return null;
        return await response.json();
      } catch {
        return null;
      }
    }, endpoint);

    if (!data || typeof data !== "object") continue;

    const record = data as Record<string, unknown>;
    const legalName =
      String(
        record.organizationName ??
          record.legalName ??
          record.supplierFullName ??
          record.fullName ??
          record.organization ??
          ""
      ).trim();

    const storeName = String(
      record.supplierName ?? record.name ?? record.trademark ?? `Продавец ${sellerId}`
    ).trim();

    if (legalName || storeName) {
      const info: SellerLegalInfo = {
        sellerId,
        storeName: storeName || `Продавец ${sellerId}`,
        legalName: legalName || storeName,
        sellerUrl: `https://www.wildberries.ru/seller/${sellerId}`,
        productCount:
          typeof record.goodsCount === "number"
            ? record.goodsCount
            : typeof record.totalProducts === "number"
              ? record.totalProducts
              : undefined,
      };
      legalNameCache.set(sellerId, info);
      return info;
    }
  }

  try {
    await page.goto(`https://www.wildberries.ru/seller/${sellerId}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(2000);

    const pageData = await page.evaluate(() => {
      const selectors = [
        ".seller-info__title",
        ".seller-details__name",
        ".seller-info__name",
        "[data-link='sellerName']",
        "h1",
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
          return { title: el.textContent.trim(), body: document.body.innerText.slice(0, 5000) };
        }
      }

      return { title: "", body: document.body.innerText.slice(0, 5000) };
    });

    const legalName =
      extractLegalNameFromText(pageData.body) ||
      extractLegalNameFromText(pageData.title) ||
      pageData.title;

    const info: SellerLegalInfo = {
      sellerId,
      storeName: pageData.title || `Продавец ${sellerId}`,
      legalName: legalName || pageData.title || `Продавец ${sellerId}`,
      sellerUrl: `https://www.wildberries.ru/seller/${sellerId}`,
    };

    legalNameCache.set(sellerId, info);
    return info;
  } catch {
    const fallback: SellerLegalInfo = {
      sellerId,
      storeName: `Продавец ${sellerId}`,
      legalName: `Продавец ${sellerId}`,
      sellerUrl: `https://www.wildberries.ru/seller/${sellerId}`,
    };
    legalNameCache.set(sellerId, fallback);
    return fallback;
  }
}

export async function getSellersLegalInfo(
  page: Page,
  sellerIds: string[]
): Promise<SellerLegalInfo[]> {
  const unique = [...new Set(sellerIds)];
  const results: SellerLegalInfo[] = [];

  for (const sellerId of unique) {
    results.push(await getSellerLegalInfo(page, sellerId));
    await page.waitForTimeout(200);
  }

  return results;
}
