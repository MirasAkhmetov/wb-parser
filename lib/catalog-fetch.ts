/**
 * Каталог продавца загружается только через браузер, открывающий страницы
 * продавца как обычный посетитель (см. parser.ts).
 *
 * Прямые запросы к API каталога больше не используются: WB закрыл его
 * антиботом wbaas. С сервера они получают 403, а из браузера распознаются
 * как бот и ужесточают проверку для всего IP.
 */

/** Пауза между страницами каталога: темп как у человека, без всплесков */
export const PAGE_DELAY_MS = 3000;

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
