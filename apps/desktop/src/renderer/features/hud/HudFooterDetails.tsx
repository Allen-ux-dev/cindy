import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Tip } from '@/components/ui/tooltip';

/** The HUD popup contains quota only. Normal mode retains the full footer. */
export function HudFooterDetails({
  active,
  children,
  summary,
}: {
  active: boolean;
  children: ReactNode;
  summary: ReactNode;
}) {
  const { t } = useTranslation();
  if (!active)
    return <div className="flex min-w-0 flex-1 items-center justify-between gap-3">{children}</div>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Tip text={t('hud.details')}>
          <button type="button" className="hud-footer-details-button" aria-label={t('hud.details')}>
            <MoreHorizontal size={14} />
          </button>
        </Tip>
      </PopoverTrigger>
      <PopoverContent
        onOpenAutoFocus={(event) => event.preventDefault()}
        side="top"
        align="end"
        className="hud-footer-details-panel w-auto max-w-[calc(100vw-24px)] p-3"
      >
        <div>{summary}</div>
      </PopoverContent>
    </Popover>
  );
}
