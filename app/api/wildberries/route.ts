import { NextRequest } from "next/server";
import { parseWildberriesSeller } from "@/lib/parser";
import { parseArticleList, parseListInput } from "@/lib/wb-utils";
import { getApiErrorPayload } from "@/lib/api-error";

export const runtime = "nodejs";
export const maxDuration = 300;
export const preferredRegion = ["fra1", "cdg1", "arn1"];

interface RequestBody {
  url: string;
  flaggedArticles?: string;
  trademarkKeywords?: string;
  useRightsDatabase?: boolean;
}

export async function POST(request: NextRequest) {
  let body: RequestBody;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const { url, flaggedArticles = "", trademarkKeywords = "", useRightsDatabase = false } = body;

  if (!url || typeof url !== "string") {
    return Response.json(
      { error: "Укажите ссылку на страницу продавца." },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      const heartbeat = setInterval(() => {
        send({ type: "heartbeat" });
      }, 2000);

      try {
        send({
          type: "progress",
          currentPage: 0,
          totalPages: null,
          productsFound: 0,
          status: "Запуск...",
        });

        const result = await parseWildberriesSeller(
          url.trim(),
          {
            onProgress: (progress) => {
              send({ type: "progress", ...progress });
            },
          },
          {
            flaggedArticles: [...parseArticleList(flaggedArticles)],
            trademarkKeywords: parseListInput(trademarkKeywords),
            useRightsDatabase,
          }
        );

        send({
          type: "complete",
          products: result.products,
          totalPages: result.totalPages,
          sellerId: result.sellerId,
          flaggedCount: result.flaggedCount,
        });
      } catch (error) {
        const { message, code } = getApiErrorPayload(error);
        send({ type: "error", message, code });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
