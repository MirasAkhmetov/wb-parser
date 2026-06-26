export interface WbProduct {
  article: string;
  title: string;
  url: string;
  price: string;
  priceValue: number;
  brand: string;
  category: string;
  image: string;
  rating: string;
  reviews: string;
  supplier?: string;
  supplierId?: string;
  deliveryHours?: number;
  isFlagged?: boolean;
  flagReason?: "complaint" | "keyword" | "database";
  flagLabel?: string;
  rightsHolder?: string;
}

export interface ParseProgress {
  currentPage: number;
  totalPages: number | null;
  productsFound: number;
  status: string;
}

export interface ParseResult {
  products: WbProduct[];
  totalPages: number;
  sellerId: string;
  flaggedCount: number;
}

export interface ParseCallbacks {
  onProgress?: (progress: ParseProgress) => void;
}

export interface TrademarkOptions {
  flaggedArticles?: string[];
  trademarkKeywords?: string[];
  useRightsDatabase?: boolean;
}

export interface SellerLegalInfo {
  sellerId: string;
  storeName: string;
  legalName: string;
  sellerUrl: string;
  productCount?: number;
}

export interface SearchSellerResult {
  seller: SellerLegalInfo;
  products: WbProduct[];
  minPrice: number;
}

export interface PriceCompareStats {
  query: string;
  city: string;
  dest: string;
  totalFound: number;
  analyzed: number;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  cheapest: WbProduct | null;
  fastestDelivery: WbProduct | null;
}

export interface PriceCompareResult {
  stats: PriceCompareStats;
  products: WbProduct[];
}

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "UNAVAILABLE"
      | "BLOCKED"
      | "NOT_FOUND"
      | "INVALID_URL"
      | "UNKNOWN"
  ) {
    super(message);
    this.name = "ParseError";
  }
}

export const WB_DESTINATIONS: Record<string, { label: string; dest: string }> = {
  moscow: { label: "Москва", dest: "-1257786" },
  spb: { label: "Санкт-Петербург", dest: "-1255942" },
};
