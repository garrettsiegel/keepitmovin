import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import chalk from "chalk";
import { ensurePtyHelperExecutable } from "./pty-helper.js";

// node-pty is a native module and is loaded LAZILY (via require, on first spawn)
// rather than a static import — so merely importing this file never triggers the
// native binary load. On platforms or CI where node-pty isn't built for the
// arch, `loadNodePty()` throws and `defaultPtyFactory` falls back to pipes.
const require = createRequire(import.meta.url);
type NodePtyModule = typeof import("node-pty");
let cachedNodePty: NodePtyModule | undefined;
const loadNodePty = (): NodePtyModule =>
  (cachedNodePty ??= require("node-pty") as NodePtyModule);

export interface PtyProcess {
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void;
  write(data: string): void;
  kill(signal?: string): void;
  resize?(cols: number, rows: number): void;
}

export interface PtyFactoryOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export type PtyFactory = (
  command: string,
  args: string[],
  options: PtyFactoryOptions
) => PtyProcess;

class ChildProcessPtyAdapter implements PtyProcess {
  readonly #child: ChildProcessWithoutNullStreams;
  #exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];
  #exited = false;

  constructor(child: ChildProcessWithoutNullStreams) {
    this.#child = child;
    this.#child.on("exit", (exitCode) => {
      this.#emitExit(exitCode ?? 1);
    });
    this.#child.on("error", () => {
      this.#emitExit(127);
    });
  }

  onData(listener: (data: string) => void): void {
    this.#child.stdout.on("data", (data: Buffer) => listener(data.toString("utf8")));
    this.#child.stderr.on("data", (data: Buffer) => listener(data.toString("utf8")));
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void {
    this.#exitListeners.push(listener);
  }

  write(data: string): void {
    this.#child.stdin.write(data);
  }

  kill(signal?: string): void {
    this.#child.kill(signal as NodeJS.Signals | undefined);
  }

  // No-op: a piped child process has no TTY to resize. Kept so the pipe
  // fallback still satisfies the PtyProcess contract.
  resize(): void {}

  #emitExit(exitCode: number): void {
    if (this.#exited) {
      return;
    }

    this.#exited = true;
    this.#exitListeners.forEach((listener) => listener({ exitCode }));
  }
}

const nodePtyFactory: PtyFactory = (command, args, options) => {
  // Loads the native module (throws if unavailable → caught by defaultPtyFactory).
  const nodePty = loadNodePty();
  // Self-heal node-pty's spawn-helper exec bit before the first spawn so pnpm
  // installs don't silently drop us to non-interactive pipes.
  ensurePtyHelperExecutable();

  return nodePty.spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    name: "xterm-256color",
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24
  });
};

const pipeFallbackPtyFactory: PtyFactory = (command, args, options) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: "pipe"
  });

  return new ChildProcessPtyAdapter(child);
};

let warnedPtyFallback = false;

export const defaultPtyFactory: PtyFactory = (command, args, options) => {
  try {
    return nodePtyFactory(command, args, options);
  } catch (error) {
    if (!warnedPtyFallback) {
      warnedPtyFallback = true;
      const detail = error instanceof Error ? error.message : String(error);
      process.stderr.write(
        chalk.yellow(
          `\nkeepitmovin could not start a real terminal (node-pty: ${detail}).\n` +
            "Falling back to non-interactive pipes — interactive tools like Claude Code may hang.\n" +
            "Fix: reinstall dependencies, or make node-pty's prebuilt spawn-helper executable.\n\n"
        )
      );
    }

    return pipeFallbackPtyFactory(command, args, options);
  }
};
