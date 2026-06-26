export function formatPrice(kopecks?: number): string {
  if (!kopecks || kopecks <= 0) return "";
  const rubles = kopecks / 100;
  return `${rubles.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ₽`;
}

export function getPriceValue(kopecks?: number): number {
  if (!kopecks || kopecks <= 0) return 0;
  return Math.round(kopecks / 100);
}

export function getImageUrl(articleId: number): string {
  const vol = Math.floor(articleId / 100000);
  const part = Math.floor(articleId / 1000);
  const baskets = [
    "01", "02", "03", "04", "05", "06", "07", "08", "09",
    "10", "11", "12", "13", "14", "15", "16", "17",
  ];
  const basket = baskets[vol % baskets.length] ?? "01";
  return `https://basket-${basket}.wbbasket.ru/vol${vol}/part${part}/${articleId}/images/big/1.webp`;
}

export function formatDeliveryHours(hours?: number): string {
  if (!hours || hours <= 0) return "";
  if (hours < 24) return `~${hours} ч`;
  const days = Math.ceil(hours / 24);
  return `~${days} дн.`;
}

export function parseListInput(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseArticleList(value: string): Set<string> {
  return new Set(
    parseListInput(value).map((item) => item.replace(/\D/g, "")).filter(Boolean)
  );
}
