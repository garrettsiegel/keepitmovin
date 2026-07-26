import type { PtyProcess } from "../../src/harness/index.js";

// Shared scripted PTY double. Previously duplicated inside test/harness.test.ts.

export class FakePty implements PtyProcess {
  #dataListeners: Array<(data: string) => void> = [];
  #exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];
  #exited = false;
  writes: string[] = [];

  constructor(
    private readonly script: {
      data: string;
      exitCode: number;
      waitForKill?: boolean;
      exitOnWrite?: boolean;
    }
  ) {
    queueMicrotask(() => {
      this.#dataListeners.forEach((listener) => listener(this.script.data));
      if (!this.script.waitForKill && !this.script.exitOnWrite) {
        this.exit(this.script.exitCode);
      }
    });
  }

  onData(listener: (data: string) => void): void {
    this.#dataListeners.push(listener);
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void {
    this.#exitListeners.push(listener);
  }

  write(data: string): void {
    this.writes.push(data);
    if (this.script.exitOnWrite && !this.#exited) {
      queueMicrotask(() => this.exit(this.script.exitCode));
    }
  }

  kill(): void {
    this.exit(this.script.exitCode);
  }

  resize(): void {}

  private exit(exitCode: number): void {
    if (this.#exited) {
      return;
    }

    this.#exited = true;
    this.#exitListeners.forEach((listener) => listener({ exitCode }));
  }
}
