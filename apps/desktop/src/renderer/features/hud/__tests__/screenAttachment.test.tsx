import { dispatchHudScreenSubmission, hudScreenPreflight } from '../screenSubmission';
// @vitest-environment jsdom
// User regression: successful capture followed by rejected send must retain one-shot
// intent. Public hook/checkbox entry; native IPC tests cannot cover composer acceptance.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_HUD_SETTINGS } from '../../../../shared/hud';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/toast', () => ({ toast: { loading: vi.fn(), dismiss: vi.fn(), error: vi.fn() } }));
vi.mock('@/contexts/dataOwnerGeneration', () => ({
  getDataOwnerGeneration: () => 1,
  isDataOwnerGenerationCurrent: () => true,
}));
const consent = vi.hoisted(() => ({ generation: 0 }));
vi.mock('../store', () => ({
  useHud: () => ({ active: true, settings: { ...DEFAULT_HUD_SETTINGS, allowScreen: true } }),
  getHudState: () => ({ active: true, settings: { ...DEFAULT_HUD_SETTINGS, allowScreen: true } }),
  getHudCaptureGeneration: () => consent.generation,
}));
beforeEach(() => {
  consent.generation = 0;
});
import { useHudScreenAttachment } from '../useHudScreenAttachment';
afterEach(cleanup);
it('keeps explicit screen intent for retry, and only accepted sends consume their own intent', async () => {
  const capture = vi.fn(async () => new Uint8Array([1]));
  Object.assign(window, {
    electronAPI: {
      hud: { capture },
      cacheImageFromBuffer: async () => ({ url: 'test://screen.png' }),
    },
  });
  let current!: ReturnType<typeof useHudScreenAttachment>;
  function Composer() {
    current = useHudScreenAttachment('session');
    return current.control;
  }
  render(<Composer />);
  const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
  fireEvent.click(checkbox);
  let first: Awaited<ReturnType<typeof current.prepare>>;
  await act(async () => {
    first = await current.prepare('帮我处理这个问题');
  });
  expect(first!.attachment.url).toBe('test://screen.png');
  expect(checkbox.checked).toBe(true); // send rejected: do not accept
  let retry: Awaited<ReturnType<typeof current.prepare>>;
  await act(async () => {
    retry = await current.prepare('帮我处理这个问题');
  });
  expect(capture).toHaveBeenCalledTimes(2);
  act(() => retry!.accept());
  expect(checkbox.checked).toBe(false);
  fireEvent.click(checkbox); // new intent while an older dispatch completion is queued
  act(() => first!.accept());
  expect(checkbox.checked).toBe(true);
});

// Native capture tests end when bytes return. These cover revocation while the
// renderer is caching pixels, and between preparation and the send boundary.
it.each(['permission', 'HUD lifecycle', 'task', 'checkbox'])(
  'rejects prepared pixels after %s changes during caching',
  async (change) => {
    let finishCache!: (value: { url: string }) => void;
    const cacheImageFromBuffer = vi.fn(
      () =>
        new Promise<{ url: string }>((resolve) => {
          finishCache = resolve;
        }),
    );
    Object.assign(window, {
      electronAPI: { hud: { capture: async () => new Uint8Array([1]) }, cacheImageFromBuffer },
    });
    let current!: ReturnType<typeof useHudScreenAttachment>;
    function Composer({ session = 'a' }: { session?: string }) {
      current = useHudScreenAttachment(session);
      return current.control;
    }
    const view = render(<Composer />);
    fireEvent.click(screen.getByRole('checkbox'));
    let pending!: Promise<Awaited<ReturnType<typeof current.prepare>>>;
    await act(async () => {
      pending = current.prepare('look at this screen');
      await Promise.resolve();
    });
    expect(cacheImageFromBuffer).toHaveBeenCalledOnce();
    if (change === 'task') view.rerender(<Composer session="b" />);
    else if (change === 'checkbox') {
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('checkbox'));
    } else consent.generation += 2; // off/on can occur within one React render
    const rejected = expect(pending).rejects.toThrow('capture revoked');
    await act(async () => {
      finishCache({ url: 'test://revoked.png' });
      await rejected;
    });
  },
);
it('invalidates prepared attachments before dispatch when consent changes', async () => {
  Object.assign(window, {
    electronAPI: {
      hud: { capture: async () => new Uint8Array([1]) },
      cacheImageFromBuffer: async () => ({ url: 'test://screen.png' }),
    },
  });
  let current!: ReturnType<typeof useHudScreenAttachment>;
  function Composer() {
    current = useHudScreenAttachment('a');
    return current.control;
  }
  render(<Composer />);
  let result!: Awaited<ReturnType<typeof current.prepare>>;
  await act(async () => {
    result = await current.prepare('look at this screen');
  });
  expect(typeof result?.assertCurrent).toBe('function');
  consent.generation += 2;
  expect(() => result!.assertCurrent()).toThrow('capture revoked');
});
it('tracks consent transitions even when React batches an off/on pair', async () => {
  const store = await vi.importActual<typeof import('../store')>('../store');
  let changed!: (value: import('../../../../shared/hud').HudState) => void;
  const initial = {
    active: true,
    capturing: false,
    moving: false,
    passThrough: false,
    layer: 1 as const,
    settings: { ...DEFAULT_HUD_SETTINGS, allowScreen: true },
  };
  Object.assign(window, {
    electronAPI: {
      hud: {
        get: async () => initial,
        onChanged: (cb: typeof changed) => {
          changed = cb;
          return () => {};
        },
      },
    },
  });
  function Probe() {
    store.useHud();
    return null;
  }
  await act(async () => {
    render(<Probe />);
  });
  const original = store.getHudCaptureGeneration();
  act(() => {
    changed({ ...initial, settings: { ...initial.settings, allowScreen: false } });
    changed(initial);
  });
  expect(store.getHudState().settings.allowScreen).toBe(true);
  expect(store.getHudCaptureGeneration()).toBeGreaterThan(original);
  const permissionEpoch = store.getHudCaptureGeneration();
  act(() => {
    changed({ ...initial, active: false });
    changed(initial);
  });
  expect(store.getHudState().active).toBe(true);
  expect(store.getHudCaptureGeneration()).toBeGreaterThan(permissionEpoch);
});

// Accepted outbox/background work owns its pixels. Composer cleanup or a later
// permission change must not revoke that already accepted submission.
it('keeps an accepted capture valid after composer cleanup and later consent changes', async () => {
  Object.assign(window, {
    electronAPI: {
      hud: { capture: async () => new Uint8Array([1]) },
      cacheImageFromBuffer: async () => ({ url: 'test://screen.png' }),
    },
  });
  let current!: ReturnType<typeof useHudScreenAttachment>;
  function Composer() {
    current = useHudScreenAttachment('accepted');
    return current.control;
  }
  const view = render(<Composer />);
  let capture!: NonNullable<Awaited<ReturnType<typeof current.prepare>>>;
  await act(async () => { capture = (await current.prepare('look at this screen'))!; });
  act(() => capture.accept());
  view.unmount();
  consent.generation++;
  expect(() => capture.assertCurrent()).not.toThrow();
});

// The store invokes this preflight after other asynchronous checks. Test both
// cancellation before acceptance and the accepted remote outbox lifetime.
it.each([false, true])('checks a deferred preflight with accepted=%s', async accepted => {
  Object.assign(window, { electronAPI: {
    hud: { capture: async () => new Uint8Array([1]) },
    cacheImageFromBuffer: async () => ({ url: 'test://screen.png' }),
  } });
  let current!: ReturnType<typeof useHudScreenAttachment>;
  function Composer() { current = useHudScreenAttachment('deferred'); return current.control; }
  const view = render(<Composer />);
  let capture!: NonNullable<Awaited<ReturnType<typeof current.prepare>>>;
  await act(async () => { capture = (await current.prepare('look at this screen'))!; });
  let finish!: (value: boolean) => void;
  const ready = new Promise<boolean>(resolve => { finish = resolve; });
  const preflight = hudScreenPreflight(capture, () => ready)!;
  if (accepted) {
    await act(async () => { expect(await dispatchHudScreenSubmission(capture, async () => true)).toBe(true); });
  }
  const pending = preflight();
  const result = accepted ? expect(pending).resolves.toBe(true) : expect(pending).rejects.toThrow('capture revoked');
  consent.generation++;
  view.unmount();
  finish(true);
  await result;
  if (!accepted) {
    const send = vi.fn(async () => true);
    await expect(dispatchHudScreenSubmission(capture, send)).rejects.toThrow('capture revoked');
    expect(send).not.toHaveBeenCalled();
  }
});
