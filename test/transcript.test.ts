import { describe, expect, it } from "vitest";
import { RollingTranscript } from "../src/harness/transcript.js";

describe("RollingTranscript", () => {
  it("strips ANSI codes and keeps the newest content inside the limit", () => {
    const transcript = new RollingTranscript(10);

    transcript.append("\u001b[31mhello\u001b[39m");
    transcript.append(" world");

    expect(transcript.text()).toBe("ello world");
    expect(transcript.excerpt(5)).toBe("world");
  });

  it("returns short content unchanged when it fits the window", () => {
    const transcript = new RollingTranscript(1_000);
    transcript.append("first line\nsecond line");

    expect(transcript.excerpt(4_000)).toBe("first line\nsecond line");
  });

  it("drops a leading partial line when the excerpt truncates mid-line", () => {
    const transcript = new RollingTranscript(1_000);
    transcript.append("You've used 92% of your session limit\nWorking on the task now");

    // 30 chars slices into the first line; the excerpt must start at the newline
    // boundary rather than a fragment beginning with "session limit".
    const excerpt = transcript.excerpt(30);
    expect(excerpt.startsWith("session limit")).toBe(false);
    expect(excerpt).toBe("Working on the task now");
  });
});
