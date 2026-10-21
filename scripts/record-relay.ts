import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Browser, Page } from "playwright";
import { RECORD_POLICY } from "../src/lib/relay/judge";
import { measuredRecording, readingFromAttributes } from "../src/lib/relay/metrics";
import type { StoryStep } from "../src/lib/relay/story";
import { assertPageHidesKey, duration, ensureDir, ffmpeg, launchBrowser, seedKey, watchForKey } from "./record-support";

const STREAM_MS = 5_500;
const JUDGE_MS = 6_000;
const AFTER_TYPE_MS = 800;
const WAVE_HOLD_MS = 2_500;
const EXAMPLES_MS = 7_000;
const CARD_MS = 3_400;

export async function recordRelay(options: { baseURL: string; mock: boolean; key?: string; outDir: string }): Promise<void> {
  await ensureDir(options.outDir);
  const browser = await launchBrowser();
  const work = path.join(tmpdir(), `relay-record-${Date.now()}`);
  await ensureDir(work);
  try {
    const take = await recordTake(browser, options, work);
    const finalPath = path.join(options.outDir, "relay.mp4");
    await ffmpeg(
      [
        "-y",
        "-ss",
        take.storyOffset.toFixed(3),
        "-i",
        take.webm,
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        finalPath,
      ],
      options.key ?? "",
    );
    const report = measuredRecording(
      "relay",
      take.reading,
      options.mock
        ? "Mocked decisions. p50, p95, and spend are null because this pass did not call Jev. burstDurationMs is the local re-judge. The color wave is playback and is not part of that duration."
        : "p50 and p95 are round trips through this app. burstDurationMs is the wall clock from the re-judge click to the last response. spendUsd is the sum of reported input tokens.",
    );
    const jsonPath = path.join(options.outDir, "relay.json");
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    const seconds = await duration(finalPath);
    console.log(`Wrote ${finalPath} (${seconds.toFixed(1)}s) and ${jsonPath}.`);
    if (options.mock && (seconds < 30 || seconds > 40)) {
      throw new Error(`The mock Relay clip is ${seconds.toFixed(1)}s. It needs to land between 30 and 40 seconds.`);
    }
    if (!options.mock && seconds < 5) {
      throw new Error("The Relay clip is too short to include the wave.");
    }
  } finally {
    await browser.close();
  }
}

async function recordTake(
  browser: Browser,
  options: { baseURL: string; mock: boolean; key?: string },
  work: string,
): Promise<{
  webm: string;
  storyOffset: number;
  reading: ReturnType<typeof readingFromAttributes>;
}> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    recordVideo: { dir: work, size: { width: 1440, height: 900 } },
  });
  if (options.key && !options.mock) await seedKey(context, options.key);
  const page = await context.newPage();
  const assertHidden = watchForKey(page, options.mock ? "" : (options.key ?? ""));
  const origin = Date.now();
  const storyUrl = options.mock ? "/relay?mock=1&present=1" : "/relay?present=1";
  await page.goto(`${options.baseURL}${storyUrl}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const stage = document.querySelector("[data-testid=relay-stage]");
      const backlog = Number(stage?.getAttribute("data-backlog") ?? "0");
      const ready = stage?.getAttribute("data-phase") !== "loading" && stage?.getAttribute("data-baseline") === "1";
      return backlog >= 500 && ready;
    },
    undefined,
    { timeout: options.mock ? 60_000 : 180_000 },
  );
  await page.waitForTimeout(200);
  await setStory(page, "stream");
  const storyAt = Date.now();
  await assertPageHidesKey(page, options.mock ? "" : (options.key ?? ""));
  await page.waitForTimeout(STREAM_MS);
  await setStory(page, "judge");
  await page.waitForTimeout(JUDGE_MS);
  await setStory(page, "change");
  const policy = page.getByTestId("relay-policy");
  await policy.click();
  await policy.fill("");
  await policy.pressSequentially(RECORD_POLICY, { delay: 18 });
  await page.waitForTimeout(AFTER_TYPE_MS);
  await page.getByTestId("relay-rejudge").click();
  await page.mouse.move(28, 28);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await setStory(page, "wave");
  await page.waitForFunction(
    () => {
      const stage = document.querySelector("[data-testid=relay-stage]");
      const total = Number(stage?.getAttribute("data-backlog") ?? "0");
      const shown = Number(stage?.getAttribute("data-shown") ?? "0");
      return stage?.getAttribute("data-settled") === "1" && total > 0 && shown >= total;
    },
    undefined,
    { timeout: options.mock ? 30_000 : 180_000 },
  );
  await page.waitForFunction(
    () => (document.querySelector("[data-testid=relay-metrics]")?.getAttribute("data-burst-size") ?? "") !== "",
    undefined,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(WAVE_HOLD_MS);
  await setStory(page, "examples");
  await page.waitForFunction(
    () => Number(document.querySelector("[data-testid=relay-highlights]")?.getAttribute("data-count") ?? "0") >= 1,
    undefined,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(EXAMPLES_MS);
  await setStory(page, "card");
  await page.getByTestId("relay-stat-card").waitFor({ timeout: 10_000 });
  await assertPageHidesKey(page, options.mock ? "" : (options.key ?? ""));
  assertHidden();
  const reading = readingFromAttributes(await readMetrics(page));
  if (reading.burstSize == null || reading.burstDurationMs == null) {
    throw new Error("The re-judge finished without measured burst numbers.");
  }
  if (!options.mock && (reading.p50LatencyMs == null || reading.p95LatencyMs == null)) {
    throw new Error("The live re-judge finished without round-trip percentiles.");
  }
  await page.waitForTimeout(CARD_MS);
  const webm = path.join(work, "take.webm");
  const video = page.video();
  if (!video) throw new Error("Playwright did not start a video.");
  await page.close();
  await video.saveAs(webm);
  await context.close();
  return {
    webm,
    storyOffset: Math.max(0, (storyAt - origin) / 1000 + 0.15),
    reading,
  };
}

async function setStory(page: Page, step: StoryStep) {
  await page.evaluate((name) => {
    window.dispatchEvent(new CustomEvent("relay-story", { detail: name }));
  }, step);
  await page.waitForFunction(
    (name) => document.querySelector("[data-testid=relay-stage]")?.getAttribute("data-story") === name,
    step,
    { timeout: 5_000 },
  );
}

async function readMetrics(page: Page) {
  return page.locator("[data-testid=relay-metrics]").evaluate((node) => ({
    mock: node.getAttribute("data-mock"),
    burstSize: node.getAttribute("data-burst-size"),
    burstDurationMs: node.getAttribute("data-burst-duration-ms"),
    p50LatencyMs: node.getAttribute("data-p50-ms"),
    p95LatencyMs: node.getAttribute("data-p95-ms"),
    spendUsd: node.getAttribute("data-spend-usd"),
  }));
}
