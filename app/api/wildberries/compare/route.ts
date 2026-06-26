import { NextRequest } from "next/server";
import { withWbPage } from "@/lib/browser";
import { compareProductPrices } from "@/lib/search";
import { handleApiError } from "@/lib/api-error";
import { WB_DESTINATIONS } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: { query?: string; city?: string };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const query = body.query?.trim() ?? "";
  const cityKey = body.city ?? "moscow";
  const city = WB_DESTINATIONS[cityKey] ?? WB_DESTINATIONS.moscow;

  if (!query) {
    return Response.json(
      { error: "Введите название товара для сравнения цен." },
      { status: 400 }
    );
  }

  try {
    const result = await withWbPage((page) =>
      compareProductPrices(page, query, city.dest, city.label)
    );

    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
