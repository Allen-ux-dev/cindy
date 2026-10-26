import { mountPage, subscription } from '../../ui-page/harness';
import { HudChrome } from '../../../src/renderer/features/hud/HudChrome';
import { HudSection } from '../../../src/renderer/components/settings/HudSection';
import { useHudScreenAttachment } from '../../../src/renderer/features/hud/useHudScreenAttachment';
import { DEFAULT_HUD_SETTINGS } from '../../../src/shared/hud';
function ScreenControls() {
  const { control } = useHudScreenAttachment('fixture', '/work/examples/current-task');
  return <div className="pt-12">{control}</div>;
}
void mountPage({
  route: '/cc-agent/hud-fixture',
  host: (ctx) => ({
    platform: ctx.platform,
    appShortcuts: {
      getState: () => ({
        platform: ctx.platform,
        overrides:
          ctx.case === 'chrome'
            ? {
                'hud-toggle-pass-through': {
                  code: 'F12',
                  meta: true,
                  ctrl: true,
                  alt: true,
                  shift: true,
                },
              }
            : {},
      }),
      onChanged: subscription('shortcuts'),
    },
    hud: {
      get: async () => ({
        active: ctx.case !== 'entry',
        capturing: false,
        moving: false,
        layer: 1,
        passThrough: false,
        settings: DEFAULT_HUD_SETTINGS,
      }),
      onChanged: subscription('hud'),
      setPointerRegion: async () => {},
    },
  }),
  render: (ctx) => (
    <main className="relative h-full overflow-auto bg-background p-4">
      <HudChrome />
      {ctx.case === 'chrome' && <ScreenControls />}
      {ctx.case === 'settings' || ctx.case === 'default' ? (
        <div className="pt-10">
          <HudSection />
        </div>
      ) : ctx.case === 'nested-panes' ? (
        <div className="hud-mode flex h-full flex-row" data-testid="hud-layout">
          <div
            data-layout-root-child-id="column"
            className="flex h-full flex-col"
            style={{ width: '60%' }}
          >
            <div data-layout-node-id="top" style={{ flexBasis: '40%' }}>
              <div data-panel-drag-root="tab-group:top">Top tool pane</div>
            </div>
            <div data-layout-node-id="chat" style={{ flexBasis: '60%' }}>
              <div data-panel-drag-root="chat-main" className="h-full" data-testid="hud-chat">
                Chat
              </div>
            </div>
          </div>
          <div data-panel-drag-root="tab-group:left">Left tool pane</div>
        </div>
      ) : null}
    </main>
  ),
});
