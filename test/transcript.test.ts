import { describe, expect, it } from "vitest";
import { RollingTranscript } from "../src/transcript.js";

describe("RollingTranscript", () => {
  it("strips ANSI codes and keeps the newest content inside the limit", () => {
    const transcript = new RollingTranscript(10);

    transcript.append("\u001b[31mhello\u001b[39m");
    transcript.append(" world");

    expect(transcript.text()).toBe("ello world");
    expect(transcript.excerpt(5)).toBe("world");
  });
});
