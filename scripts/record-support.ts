import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { redactSecret } from "../src/lib/jev/errors";

const nextBin = path.join(process.cwd(), "node_modules/next/dist/bin/next");
const playwrightCli = path.join(process.cwd(), "node_modules/playwright/cli.js");

export async function withRecordingApp(secret: string, run: (baseURL: string) => Promise<void>): Promise<void> {
  const env = withoutKey(process.env);
  await assertTool("ffmpeg");
  await assertTool("ffprobe");
  console.log("Installing Playwright Chromium.");
  await runCommand(process.execPath, [playwrightCli, "install", "chromium"], env, secret);
  console.log("Building the app.");
  await runCommand(process.execPath, [nextBin, "build"], env, secret);
  const port = 4173;
  const baseURL = `http://127.0.0.1:${port}`;
  console.log(`Starting the app at ${baseURL}.`);
  const server = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  pipeRedacted(server, secret);
  try {
    await waitForServer(baseURL, server);
    await run(baseURL);
  } finally {
    await stopServer(server);
  }
}

export async function seedKey(context: BrowserContext, secret: string): Promise<void> {
  await context.addInitScript((stored: string) => {
    window.localStorage.setItem("jev-atlas.apiKey", stored);
  }, secret);
}

export function watchForKey(page: Page, secret: string): () => void {
  if (!secret) return () => {};
  let leaked = false;
  const check = (text: string) => {
    if (text.includes(secret)) leaked = true;
  };
  page.on("console", (message) => check(message.text()));
  page.on("pageerror", (error) => check(error.message));
  return () => {
    if (leaked) throw new Error("The page exposed the API key. The recording stopped.");
  };
}

export async function assertPageHidesKey(page: Page, secret: string): Promise<void> {
  if (!secret) return;
  const leaked = await page.evaluate((value: string) => {
    const text = document.body.innerText;
    const fields = [...document.querySelectorAll("input, textarea")].map((node) => (node as HTMLInputElement).value);
    return text.includes(value) || fields.some((field) => field.includes(value));
  }, secret);
  if (leaked) throw new Error("The page showed the API key. The recording stopped.");
}

export async function launchBrowser() {
  return chromium.launch({ headless: true });
}

export async function ffmpeg(args: string[], secret: string): Promise<void> {
  await runCommand("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], withoutKey(process.env), secret);
}

export function duration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on("error", () => reject(new Error("ffprobe is not installed.")));
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(err.trim() || `ffprobe exited ${code}`));
      else resolve(Number(out.trim()));
    });
  });
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export function withoutKey(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env };
  delete next.TYPESAFE_API_KEY;
  return next;
}

async function waitForServer(baseURL: string, server: ChildProcess): Promise<void> {
  const deadline = Date.now() + 60_000;
  let last = "";
  while (Date.now() < deadline) {
    if (server.exitCode != null) throw new Error(`The app stopped before it was ready. ${last}`.trim());
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : "waiting";
    }
    await delay(400);
  }
  throw new Error(`The app did not answer at ${baseURL}.`);
}

function pipeRedacted(server: ChildProcess, secret: string): void {
  const write = (chunk: Buffer) => process.stdout.write(redactSecret(chunk.toString(), secret));
  server.stdout?.on("data", write);
  server.stderr?.on("data", write);
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode != null) return;
  server.kill("SIGTERM");
  const stopped = await Promise.race([
    new Promise<boolean>((resolve) => server.once("exit", () => resolve(true))),
    delay(2_000).then(() => false),
  ]);
  if (!stopped) server.kill("SIGKILL");
}

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv, secret: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    const write = (chunk: Buffer) => process.stdout.write(redactSecret(chunk.toString(), secret));
    child.stdout.on("data", write);
    child.stderr.on("data", write);
    child.on("error", (error) => reject(new Error(redactSecret(error.message, secret))));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} exited ${code}`));
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertTool(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ["-version"], { stdio: "ignore" });
    child.on("error", () => reject(new Error(`${command} is not installed. It needs to be on PATH.`)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} is not installed. It needs to be on PATH.`));
    });
  });
}
