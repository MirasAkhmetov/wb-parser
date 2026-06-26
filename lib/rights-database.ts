export interface RightsBrand {
  id: string;
  rightsHolder: string;
  legalName: string;
  keywords: string[];
}

export const RIGHTS_DATABASE: RightsBrand[] = [
  {
    id: "mary-kay",
    rightsHolder: "Mary Kay Inc.",
    legalName: "Mary Kay",
    keywords: [
      "mary kay",
      "мэри кей",
      "мери кей",
      "marykay",
      "timewise",
      "satin hands",
      "satin collection",
      "botanical effects",
      "clear proof",
      "ultimate",
      "time wise",
    ],
  },
  {
    id: "nike",
    rightsHolder: "Nike Inc.",
    legalName: "Nike",
    keywords: ["nike", "найк", "air max", "jordan"],
  },
  {
    id: "adidas",
    rightsHolder: "Adidas AG",
    legalName: "Adidas",
    keywords: ["adidas", "адидас", "originals"],
  },
  {
    id: "apple",
    rightsHolder: "Apple Inc.",
    legalName: "Apple",
    keywords: ["apple", "iphone", "airpods", "эпл"],
  },
  {
    id: "dior",
    rightsHolder: "Christian Dior",
    legalName: "Dior",
    keywords: ["dior", "диор", "christian dior"],
  },
  {
    id: "chanel",
    rightsHolder: "Chanel",
    legalName: "Chanel",
    keywords: ["chanel", "шанель"],
  },
  {
    id: "loreal",
    rightsHolder: "L'Oréal",
    legalName: "L'Oreal",
    keywords: ["loreal", "l'oreal", "лореаль", "л'ореаль"],
  },
  {
    id: "estee-lauder",
    rightsHolder: "Estée Lauder",
    legalName: "Estée Lauder",
    keywords: ["estee lauder", "estée lauder", "эсти лаудер"],
  },
];

export function matchRightsDatabase(
  title: string,
  brand: string
): RightsBrand | null {
  const haystack = `${title} ${brand}`.toLowerCase();

  for (const entry of RIGHTS_DATABASE) {
    const matched = entry.keywords.find((keyword) =>
      haystack.includes(keyword.toLowerCase())
    );
    if (matched) return entry;
  }

  return null;
}

export function getDatabaseKeywords(): string[] {
  return RIGHTS_DATABASE.flatMap((entry) => entry.keywords);
}
