import { ParseError } from "./types";

export interface ParsedSellerInput {
  sellerId: string;
  url: string;
}

function buildSellerResult(sellerId: string): ParsedSellerInput {
  return {
    sellerId,
    url: `https://www.wildberries.ru/seller/${sellerId}`,
  };
}

export function parseSellerInput(input: string): ParsedSellerInput | null {
  const raw = input.trim().replace(/\u00a0/g, " ");
  if (!raw) return null;

  if (/^\d{3,12}$/.test(raw)) {
    return buildSellerResult(raw);
  }

  const textIdMatch = raw.match(
    /(?:^|\s)(?:id|supplier(?:id)?|seller(?:id)?|продавец)\s*[:=]?\s*(\d{3,12})\b/i
  );
  if (textIdMatch?.[1]) {
    return buildSellerResult(textIdMatch[1]);
  }

  let normalized = raw;
  if (!/^https?:\/\//i.test(raw)) {
    normalized = `https://${raw}`;
  }

  if (/wildberries\.ru\/catalog\/\d+\/detail/i.test(normalized)) {
    const supplierFromProduct = normalized.match(
      /[?&](?:fsupplier|supplier(?:Id|ID)?|oldID)=(\d+)/i
    );
    if (supplierFromProduct?.[1]) {
      return buildSellerResult(supplierFromProduct[1]);
    }
    return null;
  }

  const patterns = [
    /wildberries\.ru\/seller\/(\d+)/i,
    /wildberries\.ru\/catalog\/seller\/(\d+)/i,
    /seller\.wildberries\.ru\/[^?#]*[?&](?:supplierId|supplierID|supplier_id|id)=(\d+)/i,
    /seller\.wildberries\.ru\/[^?#]*\/(\d{3,12})(?:\/|$|\?)/i,
    /[?&]fsupplier=(\d+)/i,
    /[?&]supplier(?:Id|ID|_id)?=(\d+)/i,
    /[?&]oldID=(\d+)/i,
    /[?&]supplier=(\d+)/i,
    /seller[=/](\d+)/i,
    /supplier[=/](\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return buildSellerResult(match[1]);
    }
  }

  return null;
}

export function validateSellerInput(input: string): ParsedSellerInput {
  const parsed = parseSellerInput(input);
  if (!parsed) {
    throw new ParseError(
      "Не удалось определить ID продавца. Вставьте ссылку вида https://www.wildberries.ru/seller/552670, ссылку из кабинета с supplierId, или просто ID: 552670",
      "INVALID_URL"
    );
  }
  return parsed;
}
