// The homepage hero scene: Claude Code's usage meter fills, the handoff card
// travels to Codex, and the task keeps going. Every visual is a pure function of
// the loop time `t` (seconds), so the same scene can loop on the page, render a
// single still for reduced-motion visitors, and be stepped frame by frame to
// produce the README GIF (see scripts/render-hero-gif.mjs).

export const DURATION = 15;

// Beats, in seconds. Kept together so retiming the story is one edit.
const BEAT = {
  limitHit: 5.2,
  cardIn: 5.6,
  cardFly: 7.3,
  cardLanded: 8.2,
  codexActive: 8.2,
  taskDone: 12.2,
  fadeOut: 14.3,
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const seg = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const easeIn = (p: number) => p ** 2;
const easeInOut = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

type Level = "ok" | "warn" | "hit";
const levelFor = (pct: number): Level => (pct >= 100 ? "hit" : pct >= 90 ? "warn" : "ok");

interface Pane {
  root: HTMLElement;
  pct: HTMLElement;
  fill: HTMLElement;
  meter: HTMLElement;
  status: HTMLElement;
}

const pane = (root: HTMLElement, name: string): Pane => {
  const el = root.querySelector<HTMLElement>(`[data-pane="${name}"]`)!;
  const pick = (key: string) => el.querySelector<HTMLElement>(`[data-${key}]`)!;
  return { root: el, pct: pick("pct"), fill: pick("fill"), meter: pick("meter"), status: pick("status") };
};

export const mountHandoffMeter = (root: HTMLElement): void => {
  const stage = root.querySelector<HTMLElement>("[data-stage]")!;
  const claude = pane(root, "claude");
  const codex = pane(root, "codex");
  const card = root.querySelector<HTMLElement>("[data-card]")!;
  const cardRows = Array.from(card.querySelectorAll<HTMLElement>("[data-at]"));
  const chip = root.querySelector<HTMLElement>("[data-chip]")!;
  const taskFill = root.querySelector<HTMLElement>("[data-task-fill]")!;
  const taskPct = root.querySelector<HTMLElement>("[data-task-pct]")!;
  const taskLabel = root.querySelector<HTMLElement>("[data-task-label]")!;
  const lines = Array.from(root.querySelectorAll<HTMLElement>("[data-line]")).map((el) => ({
    el,
    text: el.dataset.text ?? "",
    at: Number(el.dataset.at),
    shown: -1,
  }));

  // Card travel endpoints, measured from layout (panes stack on phones, so the
  // flight is horizontal on desktop and vertical on mobile).
  let from = { x: 0, y: 0 };
  let to = { x: 0, y: 0 };
  const measure = () => {
    const s = stage.getBoundingClientRect();
    const center = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 };
    };
    from = center(claude.root);
    to = center(codex.root);
  };

  const setText = (el: HTMLElement, value: string) => {
    if (el.textContent !== value) el.textContent = value;
  };
  const setAttr = (el: HTMLElement, name: string, value: string) => {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  };

  const renderMeter = (p: Pane, pct: number, status: string, active: boolean) => {
    const rounded = Math.round(pct);
    setText(p.pct, `${rounded}%`);
    p.fill.style.transform = `scaleX(${pct / 100})`;
    setAttr(p.meter, "data-level", levelFor(rounded));
    setText(p.status, status);
    setAttr(p.root, "data-active", String(active));
  };

  const render = (t: number) => {
    // Loop seam: fade the whole scene in and out so the reset is invisible.
    stage.style.opacity = String(Math.min(seg(t, 0, 0.4), 1 - seg(t, BEAT.fadeOut, DURATION)));

    // Claude's meter accelerates into the wall (calm → amber at 90 → red);
    // Codex starts nearly fresh.
    const claudePct = lerp(76, 100, easeIn(seg(t, 0, BEAT.limitHit)));
    const claudeStatus =
      t < BEAT.limitHit ? "working" : t < BEAT.cardLanded ? "limit reached" : "handed off";
    renderMeter(claude, claudePct, claudeStatus, t < BEAT.limitHit);
    const codexPct = lerp(2, 11, seg(t, BEAT.codexActive, BEAT.fadeOut));
    renderMeter(codex, codexPct, t < BEAT.codexActive ? "next in line" : "working", t >= BEAT.codexActive);
    claude.root.style.opacity = String(1 - 0.5 * seg(t, BEAT.cardFly, BEAT.cardLanded));
    codex.root.style.opacity = String(0.5 + 0.5 * seg(t, BEAT.cardFly + 0.3, BEAT.cardLanded + 0.2));

    // The task never resets: it only pauses while the card is in flight.
    const task =
      t < BEAT.limitHit
        ? lerp(0.08, 0.52, seg(t, 0, BEAT.limitHit))
        : t < BEAT.codexActive
          ? 0.52
          : lerp(0.52, 1, easeOut(seg(t, BEAT.codexActive, BEAT.taskDone)));
    taskFill.style.transform = `scaleX(${task})`;
    setText(taskPct, `${Math.round(task * 100)}%`);
    const done = t >= BEAT.taskDone;
    setText(taskLabel, done ? "✓ Shipped · 2 tools · 0 restarts" : "Task · Add refresh-token rotation");
    setAttr(root, "data-done", String(done));

    const handing = t >= BEAT.limitHit && t < BEAT.cardLanded + 0.4;
    setText(chip, handing ? "» handing off…" : "» keepitmovin");
    setAttr(chip, "data-live", String(handing));

    // Terminal lines type in at their cue.
    for (const line of lines) {
      const started = t >= line.at;
      if (line.el.hidden === started) line.el.hidden = !started;
      const typing = seg(t, line.at, line.at + Math.min(0.5, line.text.length * 0.02));
      const count = Math.round(typing * line.text.length);
      if (count !== line.shown) {
        line.shown = count;
        line.el.textContent = line.text.slice(0, count);
      }
    }

    // The handoff card: appears over Claude, fills in, arcs to Codex, is absorbed.
    const appear = easeOut(seg(t, BEAT.cardIn, BEAT.cardIn + 0.4));
    const fly = easeInOut(seg(t, BEAT.cardFly, BEAT.cardLanded));
    const absorb = seg(t, BEAT.cardLanded, BEAT.cardLanded + 0.45);
    const x = lerp(from.x, to.x, fly);
    const y = lerp(from.y, to.y, fly) - Math.sin(Math.PI * fly) * 28;
    const scale = lerp(0.92, 1, appear) * lerp(1, 0.55, absorb);
    card.style.opacity = String(appear * (1 - absorb));
    card.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
    for (const row of cardRows) row.style.opacity = String(seg(t, Number(row.dataset.at), Number(row.dataset.at) + 0.3));
  };

  measure();
  new ResizeObserver(measure).observe(stage);

  // Reduced motion: one still frame that tells the whole story (both tools,
  // task shipped) and never animates.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    render(BEAT.taskDone + 0.5);
    return;
  }

  // Only spend frames while the scene is on screen and the tab is visible.
  let visible = true;
  let frame = 0;
  let startedAt = performance.now();
  let pausedAt: number | undefined;
  const tick = (now: number) => {
    render(((now - startedAt) / 1000) % DURATION);
    frame = requestAnimationFrame(tick);
  };
  const play = () => {
    if (frame || !visible || document.hidden) return;
    if (pausedAt !== undefined) startedAt += performance.now() - pausedAt;
    pausedAt = undefined;
    frame = requestAnimationFrame(tick);
  };
  const pause = () => {
    if (!frame) return;
    cancelAnimationFrame(frame);
    frame = 0;
    pausedAt = performance.now();
  };
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    visible ? play() : pause();
  }).observe(root);
  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : play()));

  // Frame-exact seeking for the GIF renderer: stops the loop and draws `t`.
  root.addEventListener("handoff-meter:seek", (event) => {
    pause();
    visible = false;
    measure();
    render((event as CustomEvent<{ t: number }>).detail.t);
  });

  play();
};
