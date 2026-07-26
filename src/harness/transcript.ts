import stripAnsi from "strip-ansi";

export class RollingTranscript {
  #content = "";

  constructor(private readonly limitChars: number) {}

  append(chunk: string): void {
    this.#content = `${this.#content}${stripAnsi(chunk)}`;

    if (this.#content.length > this.limitChars) {
      this.#content = this.#content.slice(this.#content.length - this.limitChars);
    }
  }

  text(): string {
    return this.#content;
  }

  excerpt(chars = 4_000): string {
    if (this.#content.length <= chars) {
      return this.#content;
    }

    // Slicing the tail at a fixed offset can start the excerpt mid-line, so a
    // fragment like "session limit · resets…" could head the first line and
    // spoof the failure detector's "pattern at line start" prose guard. Drop
    // the leading partial line so the excerpt always begins at a line boundary.
    const slice = this.#content.slice(this.#content.length - chars);
    const newlineIndex = slice.indexOf("\n");
    return newlineIndex === -1 ? slice : slice.slice(newlineIndex + 1);
  }
}
