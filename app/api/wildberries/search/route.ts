import { NextRequest } from "next/server";
import { withWbPage } from "@/lib/browser";
import { searchSellersByKeywords } from "@/lib/search";
import { parseListInput } from "@/lib/wb-utils";
import { handleApiError } from "@/lib/api-error";
import { WB_DESTINATIONS } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: { keywords?: string };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const keywords = parseListInput(body.keywords ?? "");
  const dest = WB_DESTINATIONS.moscow.dest;

  if (!keywords.length) {
    return Response.json(
      { error: "Введите ключевые слова для поиска." },
      { status: 400 }
    );
  }

  try {
    const results = await withWbPage((page) =>
      searchSellersByKeywords(page, keywords, dest)
    );

    return Response.json({ results, total: results.length });
  } catch (error) {
    return handleApiError(error);
  }
}
