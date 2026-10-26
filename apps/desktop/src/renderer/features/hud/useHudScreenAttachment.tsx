import { HudPathChip } from './HudPathChip';
import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Monitor } from 'lucide-react';
import { useHud, getHudState, getHudCaptureGeneration } from './store';
import { isHudScreenQuestion } from '../../../shared/hud';
import type { AttachedFile } from '@/lib/fileTypes';
import { extractIpcError } from '@/utils/ipcError';
import {
  getDataOwnerGeneration,
  isDataOwnerGenerationCurrent,
} from '@/contexts/dataOwnerGeneration';

/** Composer-scoped one-shot intent: never inherited by a different task. */
export function useHudScreenAttachment(sessionId?: string | null, workingDir?: string | null) {
  const hud = useHud();
  const { t } = useTranslation();
  const [armed, setArmed] = useState(false);
  const intentGeneration = useRef(0);
  useEffect(() => {
    intentGeneration.current++;
    setArmed(false);
    return () => {
      intentGeneration.current++;
    };
  }, [sessionId, hud.active]);
  async function prepare(
    text: string,
  ): Promise<{ attachment: AttachedFile; assertCurrent(): void; accept(): void } | undefined> {
    if (!hud.active || (!armed && !isHudScreenQuestion(text))) return;
    const intent = intentGeneration.current;
    const owner = getDataOwnerGeneration();
    const generation = getHudCaptureGeneration();
    const assertCurrent = () => {
      if (
        intent !== intentGeneration.current ||
        generation !== getHudCaptureGeneration() ||
        !isDataOwnerGenerationCurrent(owner) ||
        !getHudState().active ||
        !getHudState().settings.allowScreen
      )
        throw new Error('capture revoked');
    };
    const id = toast.loading(t('hud.capturing'));
    try {
      const bytes = await window.electronAPI.hud.capture({ text, explicit: armed });
      assertCurrent();
      const name = `screen-${Date.now()}.png`;
      let url: string | undefined;
      let base64: string | undefined;
      if (sessionId) {
        url = (
          await window.electronAPI.cacheImageFromBuffer({
            sessionId,
            buffer: bytes,
            mimeType: 'image/png',
            suggestedName: name,
          })
        ).url;
      } else {
        // Same in-memory image representation used by the existing new-task composer.
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
        });
      }
      assertCurrent();
      const attachment: AttachedFile = {
        id: crypto.randomUUID(),
        name,
        originalName: name,
        path: `clipboard://${name}`,
        category: 'image',
        ext: '.png',
        mimeType: 'image/png',
        size: bytes.byteLength,
        url,
        base64,
      };
      return {
        attachment,
        assertCurrent,
        accept() {
          if (intent !== intentGeneration.current || !isDataOwnerGenerationCurrent(owner)) return;
          intentGeneration.current++;
          setArmed(false);
        },
      };
    } catch (error) {
      const reason = extractIpcError(error)?.message;
      toast.error(
        t(
          reason === 'HUD_SCREEN_DISABLED'
            ? 'hud.screenDisabled'
            : reason === 'HUD_SCREEN_PERMISSION'
              ? 'hud.screenPermission'
              : 'hud.captureFailed',
        ),
      );
      throw error;
    } finally {
      toast.dismiss(id);
    }
  }
  const control = hud.active ? (
    <div className="hud-composer-meta-row">
      <label className="hud-screen-control text-12 text-muted-foreground">
        <input
          type="checkbox"
          checked={armed}
          onChange={(event) => {
            intentGeneration.current++;
            setArmed(event.target.checked);
          }}
          disabled={hud.capturing}
        />
        <Monitor size={13} aria-hidden="true" />
        {t('hud.thisScreen')}
      </label>
      {workingDir && <HudPathChip path={workingDir} />}
    </div>
  ) : null;
  return { prepare, control };
}
