import { launch } from "@cloudflare/playwright";

/** Render a page and capture bounded body text and a viewport screenshot. */
export async function capturePage(binding: Fetcher, url: string) {
  const browser = await launch(binding);

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(20_000);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const title = await page.title();
    const content = (await page.locator("body").innerText()).slice(0, 100_000);
    const screenshot = await page.screenshot({ fullPage: false });

    return { title, content, screenshot };
  } finally {
    await browser.close();
  }
}
