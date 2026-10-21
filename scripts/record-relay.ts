import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Browser, Page } from "playwright";
import { REJUDGE_POLICY } from "../src/lib/relay/judge";
import { measuredRecording, readingFromAttributes } from "../src/lib/relay/metrics";
import { assertPageHidesKey, duration, ensureDir, ffmpeg, launchBrowser, seedKey, watchForKey } from "./record-support";

const WATCH_MS = 10_000;
const TYPE_DELAY_MS = 32;
const AFTER_TYPE_MS = 1_000;
const LINGER_MS = 11_000;

export async function recordRelay(options: { baseURL: string; mock: boolean; key?: string; outDir: string }): Promise<void> {
  await ensureDir(options.outDir);
  const browser = await launchBrowser();
  const work = path.join(tmpdir(), `relay-record-${Date.now()}`);
  await ensureDir(work);
  try {
    const take = await recordTake(browser, options, work);
    const cold = path.join(work, "cold.mp4");
    const story = path.join(work, "story.mp4");
    const finalPath = path.join(options.outDir, "relay.mp4");
    await ffmpeg(
      ["-y", "-ss", take.waveOffset.toFixed(3), "-i", take.webm, "-t", "5", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", cold],
      options.key ?? "",
    );
    await ffmpeg(
      ["-y", "-ss", take.storyOffset.toFixed(3), "-i", take.webm, "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", story],
      options.key ?? "",
    );
    await ffmpeg(
      [
        "-y",
        "-i",
        cold,
        "-i",
        story,
        "-filter_complex",
        "[0:v]scale=1440:900,setsar=1[a];[1:v]scale=1440:900,setsar=1[b];[a][b]concat=n=2:v=1:a=0,format=yuv420p",
        "-an",
        "-c:v",
        "libx264",
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
    if (options.mock && (seconds < 30 || seconds > 45)) {
      throw new Error(`The mock Relay clip is ${seconds.toFixed(1)}s. It needs to land between 30 and 45 seconds.`);
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
  waveOffset: number;
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
  const storyUrl = options.mock ? "/relay?mock=1" : "/relay";
  await page.goto(`${options.baseURL}${storyUrl}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(
    () => Number(document.querySelector("[data-testid=relay-stage]")?.getAttribute("data-backlog") ?? "0") >= 500,
    { timeout: 60_000 },
  );
  const storyAt = Date.now();
  await assertPageHidesKey(page, options.mock ? "" : (options.key ?? ""));
  await page.waitForTimeout(WATCH_MS);
  const policy = page.getByTestId("relay-policy");
  await policy.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await policy.pressSequentially(REJUDGE_POLICY, { delay: TYPE_DELAY_MS });
  await page.waitForTimeout(AFTER_TYPE_MS);
  await page.getByTestId("relay-rejudge").click();
  await page.waitForFunction(
    () => {
      const state = document.querySelector("[data-testid=relay-wave]")?.getAttribute("data-state");
      return state === "playing" || state === "done";
    },
    { timeout: options.mock ? 30_000 : 1_200_000 },
  );
  const waveAt = Date.now();
  await page.waitForSelector('[data-testid="relay-wave"][data-state="done"]', { timeout: options.mock ? 30_000 : 1_200_000 });
  await page.waitForFunction(
    () => (document.querySelector("[data-testid=relay-metrics]")?.getAttribute("data-burst-size") ?? "") !== "",
    { timeout: 15_000 },
  );
  await assertPageHidesKey(page, options.mock ? "" : (options.key ?? ""));
  assertHidden();
  const reading = readingFromAttributes(await readMetrics(page));
  if (reading.burstSize == null || reading.burstDurationMs == null) {
    throw new Error("The re-judge finished without measured burst numbers.");
  }
  if (!options.mock && (reading.p50LatencyMs == null || reading.p95LatencyMs == null)) {
    throw new Error("The live re-judge finished without round-trip percentiles.");
  }
  await page.waitForTimeout(LINGER_MS);
  const webm = path.join(work, "take.webm");
  const video = page.video();
  if (!video) throw new Error("Playwright did not start a video.");
  await page.close();
  await video.saveAs(webm);
  await context.close();
  return {
    webm,
    waveOffset: Math.max(0, (waveAt - origin) / 1000 - 0.15),
    storyOffset: Math.max(0, (storyAt - origin) / 1000 - 0.15),
    reading,
  };
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
