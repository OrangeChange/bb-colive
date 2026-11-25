import { RadioGroup, RadioGroupItem } from "./shadcn/radio-group";
import { DateTimeField, localDateTimeValue } from "./DateTimeField";
import { Checkbox } from "./shadcn/checkbox";
import { Button } from "./shadcn/button";
import { formatUiDateTime } from "../i18n/format.ts";
import { useUiLanguage } from "../i18n/react.ts";
import { localized, uiText } from "../i18n/index.ts";
import { useEffect, useId, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./shadcn/dialog";
import {
  buildCloudRecoverySelection,
  createCloudRecoverySelectionDraft,
  type CloudRecoveryScope,
  type CloudRecoverySelectionDraft,
} from '../cloudSync/cloudRecoverySelection.ts';
import type { CloudRecoverySelection } from '../cloudSync/recoveryContract.ts';
import {
  createRecoveryTransport,
  type CloudRecoverySessionItem,
} from '../cloudSync/recoveryTransport.ts';
import { accentSolidButtonClass } from './actionButtonStyles.ts';
import { recoveryTimestamp } from '../cloudSync/recoverySessionMetadata.ts';
import { readRecoverySessionPages } from '../cloudSync/recoverySessionPages.ts';
import { ArchiveCoverThumbnail } from './ArchiveCoverThumbnail';

const scopeOptions: Array<{ value: CloudRecoveryScope; label: string; description: string }> = localized(() => ([
  { value: 'all', label: uiText("cloudRecoveryDialog.scopeOptions.label"), description: uiText("cloudRecoveryDialog.scopeOptions.description") },
  { value: 'sessions', label: uiText("cloudRecoveryDialog.scopeOptions.label2"), description: uiText("cloudRecoveryDialog.scopeOptions.description2") },
  { value: 'time', label: uiText("cloudRecoveryDialog.scopeOptions.label3"), description: uiText("cloudRecoveryDialog.scopeOptions.description3") },
]));

const dateLabel = (value?: string | null) => {
  if (!value) return uiText("cloudRecoveryDialog.dateLabel");
  const time = new Date(recoveryTimestamp(value) ?? NaN);
  return Number.isFinite(time.getTime())
    ? formatUiDateTime(time)
    : uiText("cloudRecoveryDialog.dateLabel");
};

const sessionStatus = (session: CloudRecoverySessionItem) => {
  if (session.live_status === 'ongoing') return uiText("cloudRecoveryDialog.sessionStatus");
  if (session.live_status === 'ended') return uiText("cloudRecoveryDialog.sessionStatus2");
  return uiText("cloudRecoveryDialog.sessionStatus3");
};

const qualityLabel = (quality?: CloudRecoverySessionItem['quality']) => {
  if (quality === 'complete') return uiText("cloudRecoveryDialog.qualityLabel");
  if (quality === 'incomplete') return uiText("cloudRecoveryDialog.qualityLabel2");
  return uiText("cloudRecoveryDialog.qualityLabel3");
};

export function CloudRecoveryDialog({
  roomId,
  ownerName,
  onClose,
  onOpenSettings,
  onStart,
}: {
  roomId: string;
  ownerName: string;
  onClose: () => void;
  onOpenSettings: () => void;
  onStart: (selection: CloudRecoverySelection) => Promise<'started' | 'binding-required' | 'busy'>;
}) {
  useUiLanguage();
  const [draft, setDraft] = useState<CloudRecoverySelectionDraft>(createCloudRecoverySelectionDraft);
  const [sessions, setSessions] = useState<CloudRecoverySessionItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestGeneration = useRef(0);
  const [loadError, setLoadError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const transport = useRef(createRecoveryTransport()).current;

  const load = async (cursor?: string) => {
    const generation = ++requestGeneration.current;
    const active = () => requestGeneration.current === generation;
    setLoading(true);
    setLoadError('');
    try {
      await readRecoverySessionPages(value => transport.listSessions(roomId, value), page => {
        setSessions(current => [...new Map([...current, ...page.items].map(item => [item.session_id, item])).values()]);
        setNextCursor(page.hasMore ? page.nextCursor : null);
      }, active, cursor);
    } catch {
      if (active()) setLoadError(uiText("cloudRecoveryDialog.CloudRecoveryDialog.load"));
    } finally {
      if (active()) setLoading(false);
    }
  };

  useEffect(() => { void load(); return () => { requestGeneration.current++; }; }, []);

  const toggleSession = (sessionId: string) => {
    setValidationError('');
    setDraft(current => ({
      ...current,
      sessionIds: current.sessionIds.includes(sessionId)
        ? current.sessionIds.filter(value => value !== sessionId)
        : [...current.sessionIds, sessionId],
    }));
  };

  const submit = async () => {
    if (submitting || loading || loadError || nextCursor) return;
    const built = buildCloudRecoverySelection(draft);
    if (!built.selection) {
      setValidationError(built.error ?? uiText("cloudRecoveryDialog.CloudRecoveryDialog.submit"));
      return;
    }
    setSubmitting(true);
    setValidationError('');
    try {
      const result = await onStart(built.selection);
      if (result === 'binding-required') {
        onClose();
        onOpenSettings();
        return;
      }
      if (result === 'busy') {
        setValidationError(uiText("cloudRecoveryDialog.CloudRecoveryDialog.submit2"));
        return;
      }
      onClose();
    } catch {
      setValidationError(uiText("cloudRecoveryDialog.CloudRecoveryDialog.submit3"));
    } finally {
      setSubmitting(false);
    }
  };

  return <Dialog open onOpenChange={open=>{if(!open&&!submitting)onClose();}}><DialogContent asChild showCloseButton={false} onEscapeKeyDown={event=>{if(submitting)event.preventDefault();}} onInteractOutside={event=>{if(submitting)event.preventDefault();}} className="max-w-none gap-0 p-0"><section className="ui-modal-surface flex max-h-[min(760px,calc(100vh-24px))] w-[min(680px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg border border-line bg-surface">
        <header className="shrink-0 border-b border-line px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle asChild><h2 id={titleId} className="ui-type-page-title truncate text-t1">{uiText("cloudRecoveryDialog.CloudRecoveryDialog")}{ownerName}</h2></DialogTitle>
              <DialogDescription asChild><p id={descriptionId} className="mt-1 ui-type-control text-t3">{uiText("cloudRecoveryDialog.CloudRecoveryDialog2")}</p></DialogDescription>
            </div>
            <Button variant="outline" ref={closeRef} type="button" disabled={submitting} onClick={onClose}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line text-t2 transition-colors enabled:hover:bg-raised enabled:hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={uiText("cloudRecoveryDialog.aria_label")}>×</Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading && <div className="mb-3 min-h-9 rounded-md border border-line bg-bg px-3 py-2 ui-type-control text-t3">{uiText("cloudRecoveryDialog.CloudRecoveryDialog3")}</div>}
          {!loading && loadError && <div className="mb-3 flex min-h-9 flex-wrap items-center justify-between gap-2 rounded-md border border-danger/40 bg-bg px-3 py-2">
            <p role="alert" className="ui-type-control text-danger">{loadError}</p>
            <Button variant="outline" type="button" className="h-8 rounded-md border border-line px-3 ui-type-control text-t2 hover:bg-raised" onClick={() => void load(nextCursor ?? undefined)}>{uiText("common.retry")}</Button>
          </div>}
          <RadioGroup asChild value={draft.scope} onValueChange={next=>{setValidationError('');setDraft(current=>({...current,scope:next as CloudRecoveryScope}));}}><fieldset>
            <legend className="ui-type-section-title text-t1">{uiText("cloudRecoveryDialog.CloudRecoveryDialog4")}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {scopeOptions.map(option => <label key={option.value}
                className={`cursor-pointer rounded-md border px-3 py-2 transition-colors ${draft.scope === option.value ? 'border-accent bg-accent-subtle' : 'border-line bg-bg hover:border-accent/50 hover:bg-raised'}`}>
                <span className="flex items-center gap-2 ui-type-control text-t1">
                  <RadioGroupItem value={option.value} />
                  {option.label}
                </span>
                <span className="mt-1 block ui-type-micro text-t3">{option.description}</span>
              </label>)}
            </div>
          </fieldset></RadioGroup>

          {draft.scope === 'sessions' && <section className="mt-4" aria-labelledby="cloud-session-heading">
            <div className="flex items-center justify-between gap-3">
              <h3 id="cloud-session-heading" className="ui-type-section-title text-t1">{uiText("cloudRecoveryDialog.CloudRecoveryDialog5")}</h3>
              <span className="ui-type-meta text-t3">{uiText("cloudRecoveryDialog.CloudRecoveryDialog6")}{draft.sessionIds.length} {uiText("cloudRecoveryDialog.CloudRecoveryDialog7")}</span>
            </div>
            <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-line bg-bg">
              {!loading && !loadError && sessions.length === 0 && <div className="grid min-h-24 place-items-center ui-type-control text-t3">{uiText("cloudRecoveryDialog.CloudRecoveryDialog8")}</div>}
              {sessions.map(session => <div key={session.session_id}
                className="flex items-start gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-raised">
                <ArchiveCoverThumbnail cloudSessionId={session.session_id} alt={uiText("cloudRecoveryDialog.alt", { value: session.title || uiText("cloudRecoveryDialog.alt.value") })} size="session-list" previewEnabled={false} />
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                <Checkbox className="mt-1"  checked={draft.sessionIds.includes(session.session_id)}
                  onCheckedChange={() => toggleSession(session.session_id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate ui-type-control text-t1">{session.title || uiText("cloudRecoveryDialog.CloudRecoveryDialog9")}</span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 ui-type-micro text-t3">
                    <span>{dateLabel(recoveryTimestamp(session.source_live_started_at) ? session.source_live_started_at : session.capture_started_at)}</span>
                    <span>{sessionStatus(session)}</span>
                    <span>{qualityLabel(session.quality)}</span>
                    <span>{session.event_count ?? '0'} {uiText("cloudRecoveryDialog.CloudRecoveryDialog10")}</span>
                  </span>
                </span>
                </label>
              </div>)}
            </div>
          </section>}

          {draft.scope === 'time' && <fieldset className="mt-4">
            <legend className="ui-type-section-title text-t1">{uiText("cloudRecoveryDialog.CloudRecoveryDialog11")}</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 ui-type-control text-t2">{uiText("cloudRecoveryDialog.CloudRecoveryDialog12")}<DateTimeField label={uiText("cloudRecoveryDialog.CloudRecoveryDialog12")} value={draft.startedAt ? new Date(draft.startedAt) : undefined} onChange={date => { setValidationError(''); setDraft(current => ({ ...current, startedAt: localDateTimeValue(date) })); }} />
              </label>
              <label className="grid gap-1 ui-type-control text-t2">{uiText("cloudRecoveryDialog.CloudRecoveryDialog13")}<DateTimeField label={uiText("cloudRecoveryDialog.CloudRecoveryDialog13")} value={draft.endedAt ? new Date(draft.endedAt) : undefined} onChange={date => { setValidationError(''); setDraft(current => ({ ...current, endedAt: localDateTimeValue(date) })); }} />
              </label>
            </div>
          </fieldset>}

          <fieldset className="mt-4">
            <legend className="ui-type-section-title text-t1">{uiText("cloudRecoveryDialog.CloudRecoveryDialog14")}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {([
                ['includeDanmaku', uiText("cloudRecoveryDialog.CloudRecoveryDialog15")],
                ['includeInteractions', uiText("cloudRecoveryDialog.CloudRecoveryDialog16")],
              ] as const).map(([key, label]) => <label key={key} className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-bg px-3 py-2 ui-type-control text-t1 hover:bg-raised">
                <Checkbox  checked={draft[key]} onCheckedChange={event => setDraft(current => ({ ...current, [key]: (event === true) }))} />
                {label}
              </label>)}
            </div>
            <p className="mt-2 ui-type-micro text-t3">{uiText("cloudRecoveryDialog.CloudRecoveryDialog17")}</p>
          </fieldset>

          {validationError && <p role="alert" className="mt-3 ui-type-control text-danger">{validationError}</p>}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-4 py-3">
          <Button variant="outline" type="button" onClick={onOpenSettings} className="h-8 rounded-md border border-line bg-bg px-3 ui-type-control text-t2 hover:bg-raised hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">{uiText("cloudRecoveryDialog.CloudRecoveryDialog18")}</Button>
          <div className="flex gap-2">
            <Button variant="outline" type="button" disabled={submitting} onClick={onClose}
              className="h-8 rounded-md border border-line bg-bg px-3 ui-type-control text-t2 enabled:hover:bg-raised enabled:hover:text-t1 disabled:cursor-not-allowed disabled:opacity-50">{uiText("common.cancel")}</Button>
            <Button variant="default" type="button" disabled={submitting || loading || Boolean(loadError) || Boolean(nextCursor)} onClick={() => void submit()}
              className={accentSolidButtonClass}>{submitting ? uiText("cloudRecoveryDialog.CloudRecoveryDialog19") : uiText("cloudRecoveryDialog.CloudRecoveryDialog20")}</Button>
          </div>
        </footer>
      </section></DialogContent></Dialog>;
}
