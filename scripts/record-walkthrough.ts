import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { measuredRecording, readingFromAttributes } from "../src/lib/relay/metrics";
import { assertPageHidesKey, duration, ensureDir, ffmpeg, launchBrowser, seedKey, watchForKey } from "./record-support";

export async function recordWalkthrough(options: { baseURL: string; mock: boolean; key?: string; outDir: string }): Promise<void> {
  await ensureDir(options.outDir);
  const browser = await launchBrowser();
  const work = path.join(tmpdir(), `walkthrough-record-${Date.now()}`);
  await ensureDir(work);
  const secret = options.mock ? "" : (options.key ?? "");
  try {
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: "light",
      recordVideo: { dir: work, size: { width: 1440, height: 900 } },
    });
    if (secret) await seedKey(desktop, secret);
    const page = await desktop.newPage();
    const assertHidden = watchForKey(page, secret);
    let call = { latencyMs: "", spendUsd: "", calls: "0" };
    await page.goto(options.baseURL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByRole("heading", { level: 1 }).waitFor();
    await assertPageHidesKey(page, secret);
    await page.waitForTimeout(4_000);
    await page.getByRole("banner").getByRole("link", { name: "Gallery" }).click();
    await page.getByRole("heading", { name: /All \d+ decisions/ }).waitFor();
    await page.waitForTimeout(2_500);
    if (secret) {
      await page.getByRole("heading", { name: "Model routing", exact: true }).click();
      await page.getByRole("button", { name: "Run live" }).click();
      await page.waitForFunction(
        () => Number(document.querySelector("[data-testid=call-metrics]")?.getAttribute("data-calls") ?? "0") >= 1,
        undefined,
        { timeout: 90_000 },
      );
      call = await page.locator("[data-testid=call-metrics]").evaluate((node) => ({
        latencyMs: node.getAttribute("data-latency-ms") ?? "",
        spendUsd: node.getAttribute("data-spend-usd") ?? "",
        calls: node.getAttribute("data-calls") ?? "0",
      }));
      await assertPageHidesKey(page, secret);
      await page.waitForTimeout(6_500);
      await page.getByRole("banner").getByRole("link", { name: "Gallery" }).click();
    }
    await page.getByRole("heading", { name: "Graphs and knowledge graphs", exact: true }).click();
    await page.getByText("Sample links from the loaded packet").waitFor();
    await assertPageHidesKey(page, secret);
    await page.waitForTimeout(4_000);
    if (options.mock) {
      // The header link is /relay. A mock pass opens the labeled stand-in so the grid is already judged.
      await page.goto(`${options.baseURL}/relay?mock=1`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    } else {
      await page.getByRole("banner").getByRole("link", { name: "Relay" }).click();
    }
    await page.getByTestId("relay-stage").waitFor();
    await page.waitForFunction(
      () => {
        const stage = document.querySelector("[data-testid=relay-stage]");
        const backlog = Number(stage?.getAttribute("data-backlog") ?? "0");
        const settled = stage?.getAttribute("data-baseline") === "1" && stage?.getAttribute("data-phase") !== "loading";
        const decided = Number(stage?.getAttribute("data-decided") ?? "0");
        return backlog >= 100 && settled && decided >= Math.min(backlog, 100);
      },
      undefined,
      { timeout: options.mock ? 60_000 : 180_000 },
    );
    await assertPageHidesKey(page, secret);
    await page.waitForTimeout(4_000);
    const desktopVideo = page.video();
    if (!desktopVideo) throw new Error("Playwright did not start the walkthrough video.");
    await page.close();
    const desktopPath = path.join(work, "desktop.webm");
    await desktopVideo.saveAs(desktopPath);
    await desktop.close();

    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      colorScheme: "light",
      recordVideo: { dir: work, size: { width: 390, height: 844 } },
    });
    if (secret) await seedKey(phone, secret);
    const mobile = await phone.newPage();
    const assertMobile = watchForKey(mobile, secret);
    await mobile.goto(options.baseURL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await mobile.getByRole("heading", { level: 1 }).waitFor();
    await mobile.getByText("$0.042").first().waitFor();
    await assertPageHidesKey(mobile, secret);
    await mobile.waitForTimeout(2_000);
    await mobile.getByRole("banner").getByRole("link", { name: "Gallery" }).click();
    await mobile.getByRole("heading", { name: /All \d+ decisions/ }).waitFor();
    await mobile.waitForTimeout(2_000);
    await mobile.getByRole("banner").getByRole("link", { name: "Jev Atlas" }).click();
    await mobile.getByRole("heading", { level: 1 }).waitFor();
    await mobile.waitForTimeout(2_500);
    assertHidden();
    assertMobile();
    const mobileVideo = mobile.video();
    if (!mobileVideo) throw new Error("Playwright did not start the mobile video.");
    await mobile.close();
    const mobilePath = path.join(work, "mobile.webm");
    await mobileVideo.saveAs(mobilePath);
    await phone.close();

    const finalPath = path.join(options.outDir, "walkthrough.mp4");
    await ffmpeg(
      [
        "-y",
        "-i",
        desktopPath,
        "-i",
        mobilePath,
        "-filter_complex",
        "[0:v]scale=1440:900,setsar=1[a];[1:v]scale=390:844,pad=1440:900:(ow-iw)/2:(oh-ih)/2:color=0xefeae0,setsar=1[b];[a][b]concat=n=2:v=1:a=0,format=yuv420p",
        "-an",
        "-c:v",
        "libx264",
        "-movflags",
        "+faststart",
        finalPath,
      ],
      secret,
    );
    const latency = numberOrNull(call.latencyMs);
    const report = measuredRecording(
      "walkthrough",
      readingFromAttributes({
        mock: options.mock ? "1" : "0",
        burstSize: null,
        burstDurationMs: null,
        p50LatencyMs: call.latencyMs,
        p95LatencyMs: call.latencyMs,
        spendUsd: call.spendUsd,
      }),
      options.mock
        ? "No Jev call on this pass. The backlog burst is recorded by npm run record:relay."
        : latency == null
          ? "The demo call did not report a round trip."
          : "One live demo call. p50 and p95 are that round trip. The backlog burst is in relay.json.",
    );
    if (secret && latency == null) {
      throw new Error("The walkthrough ran with a key but did not measure a round trip.");
    }
    const jsonPath = path.join(options.outDir, "walkthrough.json");
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    const seconds = await duration(finalPath);
    console.log(`Wrote ${finalPath} (${seconds.toFixed(1)}s) and ${jsonPath}.`);
  } finally {
    await browser.close();
  }
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
