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
    return this.#content.slice(Math.max(0, this.#content.length - chars));
  }
}
