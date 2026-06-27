import { ParseError } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = process.env.VERCEL ? 8000 : 12000;
const PAGE_DELAY_MS = process.env.VERCEL ? 2000 : 500;

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

export function buildCatalogUrls(
  sellerId: string,
  pageNum: number,
  options: { withInternal?: boolean } = {}
): string[] {
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

  const urls = [
    `https://catalog.wb.ru/sellers/v4/catalog?${params}`,
  ];

  if (options.withInternal || !process.env.VERCEL) {
    urls.push(
      `https://www.wildberries.ru/__internal/u-catalog/sellers/v4/catalog?${params}`
    );
  }

  return urls;
}

async function fetchCatalogUrl(
  url: string,
  referer: string
): Promise<WbCatalogResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "ru-RU,ru;q=0.9",
        Referer: referer,
        Origin: "https://www.wildberries.ru",
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ParseError(`HTTP ${response.status}`, "UNAVAILABLE");
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      throw new ParseError("Не JSON ответ", "BLOCKED");
    }

    const data = (await response.json()) as WbCatalogResponse;
    return {
      products: data.products ?? [],
      total: data.total ?? 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCatalogPageDirect(
  sellerId: string,
  pageNum: number
): Promise<WbCatalogResponse> {
  const referer = `https://www.wildberries.ru/seller/${sellerId}`;
  const urls = buildCatalogUrls(sellerId, pageNum);
  let lastStatus = 0;
  let blocked = false;

  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await fetchCatalogUrl(url, referer);
      } catch (error) {
        if (error instanceof ParseError) {
          if (error.code === "BLOCKED" || /HTTP 403|HTTP 429/.test(error.message)) {
            blocked = true;
            lastStatus = /HTTP (\d+)/.exec(error.message)?.[1]
              ? Number(/HTTP (\d+)/.exec(error.message)![1])
              : 429;
          }
        }
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
        }
      }
    }
  }

  if (blocked || lastStatus === 403 || lastStatus === 429) {
    throw new ParseError(
      "Сайт блокирует автоматический доступ. Попробуйте через 10–15 минут.",
      "BLOCKED"
    );
  }

  throw new ParseError(
    process.env.VERCEL
      ? "Wildberries не отвечает с серверов Vercel. Попробуйте ещё раз или запустите локально: npm run dev"
      : "Не удалось получить данные каталога. Попробуйте ещё раз.",
    "UNAVAILABLE"
  );
}

export { PAGE_DELAY_MS };
