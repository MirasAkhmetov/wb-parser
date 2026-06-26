import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { chromium as playwrightChromium } from "playwright-core";
import { ParseError } from "./types";

const PAGE_LOAD_TIMEOUT = 90000;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const PROFILE_DIR = path.join(process.cwd(), ".wb-profile");

if (!process.env.VERCEL && !process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(
    process.cwd(),
    ".playwright-browsers"
  );
}

let localContext: BrowserContext | null = null;

const LAUNCH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-dev-shm-usage",
];

export function wrapBrowserError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);

  if (
    /Executable doesn't exist|playwright install|chromium distribution|browserType\.launch/i.test(
      message
    )
  ) {
    throw new ParseError(
      "Браузер не найден. Установите Google Chrome / Microsoft Edge или выполните в папке проекта: npm run setup:browsers",
      "UNAVAILABLE"
    );
  }

  if (error instanceof ParseError) throw error;
  throw error instanceof Error ? error : new Error(message);
}

async function launchOnVercel(): Promise<Browser> {
  const chromium = (await import("@sparticuz/chromium")).default;

  return playwrightChromium.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

async function applyStealthScripts(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
    Object.defineProperty(navigator, "languages", {
      get: () => ["ru-RU", "ru", "en-US", "en"],
    });
  });
}

function getContextOptions() {
  return {
    headless: process.env.WB_HEADED !== "1",
    args: LAUNCH_ARGS,
    userAgent: USER_AGENT,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    viewport: { width: 1440, height: 900 } as const,
    extraHTTPHeaders: {
      "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  };
}

async function getLocalContext(): Promise<BrowserContext> {
  if (localContext) {
    try {
      if (!localContext.browser()?.isConnected()) {
        localContext = null;
      }
    } catch {
      localContext = null;
    }
  }

  if (localContext) return localContext;

  const { chromium } = await import("playwright");
  const contextOptions = getContextOptions();
  let lastError: unknown;

  const persistentAttempts: Array<() => Promise<BrowserContext>> = [
    () =>
      chromium.launchPersistentContext(PROFILE_DIR, {
        ...contextOptions,
        channel: "chrome",
      }),
    () =>
      chromium.launchPersistentContext(PROFILE_DIR, {
        ...contextOptions,
        channel: "msedge",
      }),
    () => chromium.launchPersistentContext(PROFILE_DIR, contextOptions),
  ];

  for (const attempt of persistentAttempts) {
    try {
      localContext = await attempt();
      await applyStealthScripts(localContext);
      return localContext;
    } catch (error) {
      lastError = error;
    }
  }

  const ephemeralAttempts: Array<() => Promise<BrowserContext>> = [
    () =>
      chromium
        .launch({ headless: contextOptions.headless, channel: "chrome", args: LAUNCH_ARGS })
        .then((browser) => browser.newContext(contextOptions)),
    () =>
      chromium
        .launch({ headless: contextOptions.headless, channel: "msedge", args: LAUNCH_ARGS })
        .then((browser) => browser.newContext(contextOptions)),
    () =>
      chromium
        .launch({ headless: contextOptions.headless, args: LAUNCH_ARGS })
        .then((browser) => browser.newContext(contextOptions)),
  ];

  for (const attempt of ephemeralAttempts) {
    try {
      localContext = await attempt();
      await applyStealthScripts(localContext);
      return localContext;
    } catch (error) {
      lastError = error;
    }
  }

  wrapBrowserError(lastError);
}

async function createEphemeralPage(): Promise<{
  page: Page;
  cleanup: () => Promise<void>;
}> {
  if (process.env.VERCEL) {
    try {
      const browser = await launchOnVercel();
      const context = await browser.newContext({
        userAgent: USER_AGENT,
        locale: "ru-RU",
        viewport: { width: 1440, height: 900 },
      });
      await applyStealthScripts(context);
      const page = await context.newPage();
      page.setDefaultTimeout(PAGE_LOAD_TIMEOUT);
      return {
        page,
        cleanup: async () => {
          await context.close().catch(() => {});
          await browser.close().catch(() => {});
        },
      };
    } catch (error) {
      wrapBrowserError(error);
    }
  }

  try {
    const context = await getLocalContext();
    const page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(PAGE_LOAD_TIMEOUT);
    return { page, cleanup: async () => {} };
  } catch (error) {
    wrapBrowserError(error);
  }
}

export async function warmUpWbSession(page: Page): Promise<void> {
  if (page.url().includes("wildberries.ru") && !page.url().includes("about:")) {
    return;
  }

  try {
    await page.goto("https://www.wildberries.ru/", {
      waitUntil: "domcontentloaded",
      timeout: PAGE_LOAD_TIMEOUT,
    });
  } catch {
    throw new ParseError(
      "Не удалось подключиться к Wildberries. Проверьте интернет.",
      "UNAVAILABLE"
    );
  }

  await waitForAntiBot(page, 10000);
  await page.waitForTimeout(1000);
}

export async function waitForAntiBot(
  page: Page,
  maxWaitMs = 10000
): Promise<void> {
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    const title = await page.title();
    const blockedTitle =
      title.includes("Почти готово") ||
      title.includes("доступ ограничен") ||
      title.includes("Access denied");

    if (!blockedTitle) return;
    await page.waitForTimeout(2000);
  }
}

export function isBlockedPageContent(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    lower.includes("подтвердите, что вы не робот") ||
    lower.includes("доступ ограничен") ||
    lower.includes("access denied")
  );
}

export async function withWbPage<T>(
  fn: (page: Page) => Promise<T>
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    let cleanup = async () => {};

    try {
      const session = await createEphemeralPage();
      cleanup = session.cleanup;
      const { page } = session;

      await warmUpWbSession(page);
      return await fn(page);
    } catch (error) {
      lastError = error;

      const shouldRetry =
        attempt === 0 &&
        (error instanceof ParseError
          ? error.code === "BLOCKED" || error.code === "UNAVAILABLE"
          : error instanceof Error &&
            /execution context was destroyed|target closed/i.test(
              error.message
            ));

      if (shouldRetry) {
        if (!process.env.VERCEL) {
          try {
            await localContext?.close();
          } catch {
            // ignore
          }
          localContext = null;
        }
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      wrapBrowserError(error);
    } finally {
      await cleanup();
    }
  }

  wrapBrowserError(lastError);
}
