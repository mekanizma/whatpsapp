export type PanelLiveAlertKind = 'ticket' | 'transfer' | 'assign' | 'message';

export interface PanelLiveAlert {
  id: string;
  kind: PanelLiveAlertKind;
  title: string;
  body: string;
  /** Departman / birim adı */
  department?: string | null;
  /** Atanan kişi adı */
  assignee?: string | null;
  url?: string;
  createdAt: number;
}

type Listener = (alert: PanelLiveAlert) => void;

const listeners = new Set<Listener>();

export function pushPanelLiveAlert(
  alert: Omit<PanelLiveAlert, 'createdAt'> & { createdAt?: number }
): void {
  const full: PanelLiveAlert = {
    ...alert,
    createdAt: alert.createdAt ?? Date.now(),
  };
  for (const listener of listeners) {
    try {
      listener(full);
    } catch {
      /* ignore listener errors */
    }
  }
}

export function subscribePanelLiveAlerts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
