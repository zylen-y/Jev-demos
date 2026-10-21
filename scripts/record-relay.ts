import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { REJUDGE_POLICY } from "../src/lib/relay/judge";
import { relayRecordPlan } from "../src/lib/relay/record";

const mock = process.argv.includes("--mock");
const plan = relayRecordPlan({
  mock,
  key: process.env.TYPESAFE_API_KEY,
  baseURL: process.env.RELAY_BASE_URL,
});

if (!plan.ok) {
  console.error(plan.message);
  process.exit(2);
}

const artifacts = process.env.RELAY_ARTIFACT_DIR ?? "/opt/cursor/artifacts";
const work = path.join(tmpdir(), `relay-record-${Date.now()}`);
const coldName = plan.mock ? "relay_mock_cold_open.mp4" : "relay_live_cold_open.mp4";
const shotName = plan.mock ? "screenshot_relay_flip_wave.png" : "screenshot_relay_live_flip_wave.png";
const phoneName = plan.mock ? "screenshot_relay_mobile.png" : "screenshot_relay_live_mobile.png";

async function main() {
  await mkdir(artifacts, { recursive: true });
  await mkdir(work, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const key = process.env.TYPESAFE_API_KEY?.trim();

  try {
    const coldSs = await recordColdOpen(browser, plan, work, key);
    const storySs = await recordStory(browser, plan, work, key);
    await recordFrames(browser, plan, key);
    const coldOut = path.join(work, "cold.mp4");
    const storyOut = path.join(work, "story.mp4");
    await ffmpeg(["-y", "-ss", coldSs.toFixed(3), "-i", path.join(work, "cold.webm"), "-t", "5", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", coldOut]);
    await ffmpeg(["-y", "-ss", storySs.toFixed(3), "-i", path.join(work, "story.webm"), "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", storyOut]);
    const finalPath = path.join(artifacts, coldName);
    await ffmpeg([
      "-y",
      "-i",
      coldOut,
      "-i",
      storyOut,
      "-filter_complex",
      "[0:v]scale=1440:900,setsar=1[a];[1:v]scale=1440:900,setsar=1[b];[a][b]concat=n=2:v=1:a=0,format=yuv420p",
      "-an",
      "-c:v",
      "libx264",
      "-movflags",
      "+faststart",
      finalPath,
    ]);
    const seconds = await duration(finalPath);
    console.log(`wrote ${finalPath} (${seconds.toFixed(2)}s)`);
    if (seconds < 30 || seconds > 45) {
      throw new Error(`Clip is ${seconds.toFixed(2)}s. It needs to land between 30 and 45 seconds.`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function recordColdOpen(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  target: Extract<ReturnType<typeof relayRecordPlan>, { ok: true }>,
  dir: string,
  apiKey: string | undefined,
): Promise<number> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    recordVideo: { dir, size: { width: 1440, height: 900 } },
  });
  if (apiKey && !target.mock) await seedKey(context, apiKey);
  const page = await context.newPage();
  const origin = Date.now();
  const coldUrl = target.mock ? `${target.coldOpen}&hold=1` : target.coldOpen;
  await page.goto(`${target.baseURL}${coldUrl}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (target.mock) {
    await page.waitForSelector('[data-testid="relay-wave"][data-state="armed"]', { timeout: 60_000 });
    await page.waitForTimeout(400);
    const waveAt = Date.now();
    await page.evaluate(() => window.dispatchEvent(new Event("relay-play")));
    await waitForCount(page, "relay-revealed", 801, 10_000);
    await holdUntil(page, waveAt, 5000);
    const offset = Math.max(0, (waveAt - origin) / 1000 - 0.2);
    await saveVideo(page, path.join(dir, "cold.webm"));
    await context.close();
    return offset;
  }
  await page.waitForSelector('[data-testid="relay-wave"][data-state="playing"]', { timeout: 180_000 });
  const waveAt = Date.now();
  await waitForCount(page, "relay-revealed", 101, 180_000);
  await holdUntil(page, waveAt, 5000);
  const offset = Math.max(0, (waveAt - origin) / 1000 - 0.2);
  await saveVideo(page, path.join(dir, "cold.webm"));
  await context.close();
  return offset;
}

async function recordStory(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  target: Extract<ReturnType<typeof relayRecordPlan>, { ok: true }>,
  dir: string,
  apiKey: string | undefined,
): Promise<number> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    recordVideo: { dir, size: { width: 1440, height: 900 } },
  });
  if (apiKey && !target.mock) await seedKey(context, apiKey);
  const page = await context.newPage();
  const origin = Date.now();
  await page.goto(`${target.baseURL}${target.story}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForCount(page, "relay-decisions", 500, 60_000);
  const storyAt = Date.now();
  await page.waitForTimeout(9_000);
  const policy = page.getByTestId("relay-policy");
  await policy.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await policy.pressSequentially(REJUDGE_POLICY, { delay: 32 });
  await page.waitForTimeout(1_200);
  await page.getByTestId("relay-rejudge").click();
  await waitForCount(page, "relay-flips", 21, 180_000);
  await page.waitForSelector('[data-testid="relay-wave"][data-state="done"]', { timeout: 180_000 });
  await page.waitForTimeout(10_000);
  const offset = Math.max(0, (storyAt - origin) / 1000 - 0.15);
  await saveVideo(page, path.join(dir, "story.webm"));
  await context.close();
  return offset;
}

async function recordFrames(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  target: Extract<ReturnType<typeof relayRecordPlan>, { ok: true }>,
  apiKey: string | undefined,
) {
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  if (apiKey && !target.mock) await seedKey(desktop, apiKey);
  const page = await desktop.newPage();
  const waveUrl = target.mock ? `${target.coldOpen}&hold=1` : target.coldOpen;
  await page.goto(`${target.baseURL}${waveUrl}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (target.mock) {
    await page.waitForSelector('[data-testid="relay-wave"][data-state="armed"]', { timeout: 60_000 });
    await page.evaluate(() => window.dispatchEvent(new Event("relay-play")));
    await waitForCount(page, "relay-revealed", 901, 10_000);
  } else {
    await waitForCount(page, "relay-revealed", 101, 180_000);
  }
  await page.screenshot({ path: path.join(artifacts, shotName), type: "png" });
  await desktop.close();

  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    isMobile: true,
    hasTouch: true,
  });
  if (apiKey && !target.mock) await seedKey(phone, apiKey);
  const mobile = await phone.newPage();
  await mobile.goto(`${target.baseURL}${waveUrl}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (target.mock) {
    await mobile.waitForSelector('[data-testid="relay-wave"][data-state="armed"]', { timeout: 60_000 });
    await mobile.evaluate(() => window.dispatchEvent(new Event("relay-play")));
    await waitForCount(mobile, "relay-revealed", 401, 10_000);
  } else {
    await waitForCount(mobile, "relay-revealed", 51, 180_000);
  }
  await mobile.screenshot({ path: path.join(artifacts, phoneName), type: "png" });
  await phone.close();
}

async function seedKey(context: BrowserContext, apiKey: string) {
  await context.addInitScript((stored: string) => {
    window.localStorage.setItem("jev-atlas.apiKey", stored);
  }, apiKey);
}

async function saveVideo(page: Page, destination: string) {
  const video = page.video();
  if (!video) throw new Error("Playwright did not start a video.");
  await page.close();
  await video.saveAs(destination);
}

async function holdUntil(page: Page, started: number, totalMs: number) {
  const remaining = totalMs - (Date.now() - started);
  if (remaining > 0) await page.waitForTimeout(remaining);
}

function waitForCount(page: Page, testId: string, min: number, timeout: number) {
  return page.waitForFunction(
    ([id, floor]) => {
      const node = document.querySelector(`[data-testid="${id}"]`);
      return Number(node?.getAttribute("data-count") ?? "0") >= Number(floor);
    },
    [testId, min] as const,
    { timeout },
  );
}

function ffmpeg(args: string[]): Promise<void> {
  return run("ffmpeg", args);
}

function duration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(err || `ffprobe exited ${code}`));
      else resolve(Number(out.trim()));
    });
  });
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}`));
    });
  });
}
