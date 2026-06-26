import type { TrademarkOptions, WbProduct } from "./types";
import { matchRightsDatabase } from "./rights-database";

export function applyTrademarkFlags(
  products: WbProduct[],
  options: TrademarkOptions = {}
): { products: WbProduct[]; flaggedCount: number } {
  const flaggedArticles = new Set(
    (options.flaggedArticles ?? []).map((a) => a.replace(/\D/g, "")).filter(Boolean)
  );

  const keywords = (options.trademarkKeywords ?? [])
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  let flaggedCount = 0;

  const updated = products.map((product) => {
    if (flaggedArticles.has(product.article)) {
      flaggedCount++;
      return {
        ...product,
        isFlagged: true,
        flagReason: "complaint" as const,
        flagLabel: "Обращение правообладателя",
      };
    }

    if (options.useRightsDatabase) {
      const dbMatch = matchRightsDatabase(product.title, product.brand);
      if (dbMatch) {
        flaggedCount++;
        return {
          ...product,
          isFlagged: true,
          flagReason: "database" as const,
          flagLabel: `База ТМ: ${dbMatch.rightsHolder}`,
          rightsHolder: dbMatch.rightsHolder,
        };
      }
    }

    const haystack = `${product.title} ${product.brand}`.toLowerCase();
    const matchedKeyword = keywords.find((keyword) => haystack.includes(keyword));

    if (matchedKeyword) {
      flaggedCount++;
      return {
        ...product,
        isFlagged: true,
        flagReason: "keyword" as const,
        flagLabel: `Совпадение: «${matchedKeyword}»`,
      };
    }

    return product;
  });

  return { products: updated, flaggedCount };
}
