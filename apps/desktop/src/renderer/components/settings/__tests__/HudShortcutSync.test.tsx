// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type {
  AppShortcutOverrides,
  AppShortcutId,
  AppShortcutCombo,
} from '../../../../shared/appShortcuts';
import { DEFAULT_HUD_SETTINGS } from '../../../../shared/hud';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/useVoiceInputSettings', () => ({
  getVoiceInputSettings: () => ({ shortcut: null }),
}));
vi.mock('@/features/hud/store', () => ({
  useHud: () => ({ settings: DEFAULT_HUD_SETTINGS }),
  updateHudSettings: vi.fn(),
  resetHudSettings: vi.fn(),
}));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn() } }));
import { HudSection } from '../HudSection';
import { AppShortcutBindings } from '../AppShortcutBindings';
import { useAppShortcutDisplay } from '@/hooks/useAppShortcut';
function CurrentHint() {
  return <output data-testid="hint">{useAppShortcutDisplay('hud-toggle-pass-through')}</output>;
}
afterEach(cleanup);
it('updates both settings entries and the live shortcut hint after edit, delete and reset', async () => {
  let overrides: AppShortcutOverrides = {};
  let notify: (state: { overrides: AppShortcutOverrides }) => void = () => {};
  const publish = () => {
    notify({ overrides: { ...overrides } });
    return Promise.resolve({ overrides });
  };
  const setOverride = vi.fn((id: AppShortcutId, combo: AppShortcutCombo | null) => {
    overrides = { ...overrides, [id]: combo };
    return publish();
  });
  const setRecording = vi.fn();
  Object.assign(window, {
    electronAPI: {
      appShortcuts: {
        getState: () => ({ platform: 'darwin', overrides }),
        onChanged: (fn: typeof notify) => {
          notify = fn;
          return () => {};
        },
        setOverride,
        setRecording,
        clearOverride: (id: AppShortcutId) => {
          delete overrides[id];
          return publish();
        },
      },
    },
  });
  render(
    <>
      <div data-testid="hud">
        <HudSection />
      </div>
      <div data-testid="shortcuts">
        <AppShortcutBindings />
      </div>
      <CurrentHint />
    </>,
  );
  const hud = within(screen.getByTestId('hud'));
  const shortcuts = within(screen.getByTestId('shortcuts'));
  expect(screen.getByTestId('hint').textContent).toBe('⇧⌘H');
  fireEvent.click(hud.getByRole('button', { name: 'settings.shortcuts.editAria' }));
  await act(async () => {
    fireEvent.keyDown(window, { key: 'j', code: 'KeyJ', metaKey: true, shiftKey: true });
  });
  expect(setOverride).toHaveBeenCalledWith(
    'hud-toggle-pass-through',
    expect.objectContaining({ code: 'KeyJ', meta: true, shift: true }),
  );
  expect(hud.getByText('⇧⌘J')).toBeTruthy();
  expect(shortcuts.getByText('⇧⌘J')).toBeTruthy();
  expect(screen.getByTestId('hint').textContent).toBe('⇧⌘J');
  expect(setRecording.mock.calls).toEqual([[true], [false]]);
  const row = shortcuts
    .getByText('settings.shortcuts.items.hud-toggle-pass-through.label')
    .closest('.flex.items-center')!;
  await act(async () => {
    fireEvent.click(
      within(row as HTMLElement).getByRole('button', { name: 'settings.shortcuts.deleteAria' }),
    );
  });
  expect(hud.getByText('settings.shortcuts.none')).toBeTruthy();
  expect(screen.getByTestId('hint').textContent).toBe('');
  await act(async () => {
    fireEvent.click(hud.getByRole('button', { name: 'settings.shortcuts.reset' }));
  });
  expect(hud.getByText('⇧⌘H')).toBeTruthy();
  expect(shortcuts.getByText('⇧⌘H')).toBeTruthy();
  expect(screen.getByTestId('hint').textContent).toBe('⇧⌘H');
});
