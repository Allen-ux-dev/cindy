/** OS-independent lifecycle. All pixel delivery passes a second consent check. */
export function createHudController(deps: {
  allowed(): boolean;
  enter(): void;
  exit(): void;
  hide(): void;
  reveal(): void;
  capture(): Promise<Uint8Array>;
  changed(): void;
}) {
  let active = false;
  let capturing = false;
  let generation = 0;
  return {
    snapshot: () => ({ active, capturing }),
    setActive(next: boolean) {
      if (next === active) return;
      if (next) deps.enter();
      else deps.exit();
      active = next;
      generation++;
      deps.changed();
    },
    revokeCapture() {
      generation++;
    },
    async capture() {
      if (!active) throw new Error('HUD_INACTIVE');
      if (!deps.allowed()) throw new Error('HUD_SCREEN_DISABLED');
      if (capturing) throw new Error('HUD_BUSY');
      const started = generation;
      capturing = true;
      deps.changed();
      try {
        deps.hide();
        const pixels = await deps.capture();
        if (!active) throw new Error('HUD_INACTIVE');
        if (!deps.allowed() || generation !== started) throw new Error('HUD_SCREEN_DISABLED');
        return pixels;
      } finally {
        capturing = false;
        deps.reveal();
        deps.changed();
      }
    },
  };
}
