import { ParseError } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

export interface WbApiProduct {
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

export interface WbCatalogResponse {
  products?: WbApiProduct[];
  total?: number;
}

export function buildCatalogUrls(sellerId: string, pageNum: number): string[] {
  const params = new URLSearchParams({
    ab_testing: "false",
    appType: "1",
    curr: "rub",
    dest: "-1257786",
    hide_dtype: "15",
    hide_vflags: "4294967296",
    lang: "ru",
    page: String(pageNum),
    sort: "popular",
    spp: "30",
    supplier: sellerId,
  }).toString();

  return [
    `https://catalog.wb.ru/sellers/v4/catalog?${params}`,
    `https://www.wildberries.ru/__internal/u-catalog/sellers/v4/catalog?${params}`,
  ];
}

export async function fetchCatalogPageDirect(
  sellerId: string,
  pageNum: number
): Promise<WbCatalogResponse> {
  const referer = `https://www.wildberries.ru/seller/${sellerId}`;
  const urls = buildCatalogUrls(sellerId, pageNum);
  let lastStatus = 0;

  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "ru-RU,ru;q=0.9",
            Referer: referer,
            "User-Agent": USER_AGENT,
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          lastStatus = response.status;
          continue;
        }

        const data = (await response.json()) as WbCatalogResponse;
        return {
          products: data.products ?? [],
          total: data.total ?? 0,
        };
      } catch {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
  }

  if (lastStatus === 403 || lastStatus === 429) {
    throw new ParseError(
      "Сайт блокирует автоматический доступ. Попробуйте через 10–15 минут.",
      "BLOCKED"
    );
  }

  throw new ParseError(
    "Не удалось получить данные каталога. Попробуйте ещё раз.",
    "UNAVAILABLE"
  );
}
