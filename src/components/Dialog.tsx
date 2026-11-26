import { useEffect, useState } from 'react';

export interface DialogAction<T> {
  label: string;
  value: T;
  /** 'accent' is the main action, 'danger' deletes something. */
  kind?: 'accent' | 'danger';
}

interface Request {
  title: string;
  body?: string;
  actions: DialogAction<unknown>[];
  cancel: string | null;
  resolve: (value: unknown) => void;
}

let show: ((r: Request | null) => void) | null = null;

/** Asks a question in a sheet at the bottom of the screen. Resolves to the chosen value, or null when cancelled. */
export function choose<T>(opts: { title: string; body?: string; actions: DialogAction<T>[]; cancel?: string | null }): Promise<T | null> {
  return new Promise((resolve) => {
    if (!show) return resolve(null);
    show({ title: opts.title, body: opts.body, actions: opts.actions, cancel: opts.cancel === undefined ? 'Cancel' : opts.cancel, resolve: resolve as (v: unknown) => void });
  });
}

/** A yes/no question. `danger` marks an action that deletes something. */
export async function ask(title: string, opts: { body?: string; confirm: string; danger?: boolean }): Promise<boolean> {
  return (await choose({ title, body: opts.body, actions: [{ label: opts.confirm, value: true, kind: opts.danger ? 'danger' : 'accent' }] })) === true;
}

/** A message with a single button. */
export async function tell(title: string, body?: string): Promise<void> {
  await choose({ title, body, actions: [], cancel: 'OK' });
}

/** Renders the open dialog. Mounted once, at the root of the app. */
export function DialogHost() {
  const [req, setReq] = useState<Request | null>(null);

  useEffect(() => {
    show = setReq;
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      req.resolve(null);
      setReq(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);

  if (!req) return null;
  const close = (value: unknown) => {
    req.resolve(value);
    setReq(null);
  };

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && close(null)}>
      <div className="modal-sheet dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby={req.body ? 'dialog-body' : undefined}>
        <p id="dialog-title" className="dialog-title">
          {req.title}
        </p>
        {req.body && (
          <p id="dialog-body" className="muted">
            {req.body}
          </p>
        )}
        <div className="dialog-actions">
          {req.actions.map((a, i) => (
            <button type="button" key={i} className={`btn btn-block ${a.kind === 'danger' ? 'btn-danger' : a.kind === 'accent' ? 'btn-accent' : ''}`} onClick={() => close(a.value)}>
              {a.label}
            </button>
          ))}
          {req.cancel && (
            <button type="button" className="btn btn-block btn-secondary" autoFocus onClick={() => close(null)}>
              {req.cancel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
