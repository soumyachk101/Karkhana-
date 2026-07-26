'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './icons.tsx';

/* --- buttons -------------------------------------------------------------- */

type Tone = 'primary' | 'default' | 'ghost' | 'danger' | 'success';
type Size = 'xs' | 'sm' | 'md';

const TONES: Record<Tone, string> = {
  primary:
    'border-transparent bg-forge-500 text-white hover:bg-forge-400 shadow-card active:translate-y-px',
  default:
    'border-ink-600 bg-ink-800 text-ink-100 hover:border-ink-500 hover:bg-ink-750 active:translate-y-px',
  ghost: 'border-transparent bg-transparent text-ink-300 hover:bg-ink-800 hover:text-ink-50',
  danger: 'border-danger/35 bg-danger/10 text-danger hover:bg-danger/20',
  success: 'border-ok/35 bg-ok/10 text-ok hover:bg-ok/20',
};

const SIZES: Record<Size, string> = {
  xs: 'h-6 gap-1 rounded-sm px-1.5 text-[11px]',
  sm: 'h-7 gap-1.5 rounded-md px-2.5 text-[11.5px]',
  md: 'h-8.5 gap-2 rounded-md px-3 text-[12.5px]',
};

export function Button({
  children,
  onClick,
  tone = 'default',
  size = 'sm',
  icon,
  busy = false,
  disabled = false,
  title,
  type = 'button',
  className = '',
}: {
  children?: ReactNode;
  onClick?: () => void;
  tone?: Tone;
  size?: Size;
  icon?: IconName | string;
  busy?: boolean;
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className={`inline-flex items-center justify-center border font-medium transition-[background-color,border-color,transform,opacity] duration-150 disabled:pointer-events-none disabled:opacity-45 ${TONES[tone]} ${SIZES[size]} ${className}`}
    >
      {busy ? (
        <Spinner size={size === 'xs' ? 10 : 12} />
      ) : (
        icon && <Icon name={icon} size={size === 'md' ? 14 : 13} />
      )}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  onClick,
  title,
  active = false,
  tone = 'ghost',
  size = 'sm',
  disabled = false,
  className = '',
}: {
  icon: IconName | string;
  onClick?: () => void;
  title: string;
  active?: boolean;
  tone?: Tone;
  size?: Size;
  disabled?: boolean;
  className?: string;
}) {
  const box = size === 'xs' ? 'h-6 w-6' : size === 'md' ? 'h-8.5 w-8.5' : 'h-7 w-7';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-md border transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 ${box} ${
        active ? 'border-forge-500/50 bg-forge-500/15 text-forge-500' : TONES[tone]
      } ${className}`}
    >
      <Icon name={icon} size={size === 'md' ? 15 : 14} />
    </button>
  );
}

export function Spinner({ size = 12, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`animate-spin-slow ${className}`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.22" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* --- chrome --------------------------------------------------------------- */

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'ok' | 'danger' | 'info' | 'review';
  className?: string;
}) {
  const tones = {
    neutral: 'border-ink-600 bg-ink-800 text-ink-300',
    accent: 'border-forge-500/35 bg-forge-500/12 text-forge-500',
    ok: 'border-ok/30 bg-ok/12 text-ok',
    danger: 'border-danger/30 bg-danger/12 text-danger',
    info: 'border-info/30 bg-info/12 text-info',
    review: 'border-review/30 bg-review/12 text-review',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium leading-4 ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded border border-ink-600 bg-ink-800 px-1 font-sans text-[10px] font-medium text-ink-300">
      {children}
    </kbd>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
}: {
  options: { value: T; label?: string; icon?: IconName | string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'xs' | 'sm';
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-ink-600 bg-ink-850 p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            title={option.title ?? option.label}
            className={`inline-flex items-center gap-1.5 rounded-sm transition-colors duration-150 ${
              size === 'xs' ? 'h-5 px-1.5 text-[10.5px]' : 'h-6 px-2 text-[11.5px]'
            } ${
              active
                ? 'bg-ink-700 font-medium text-ink-50 shadow-card'
                : 'text-ink-400 hover:text-ink-100'
            }`}
          >
            {option.icon && <Icon name={option.icon} size={12.5} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Pane header used by every split-pane in the task detail view. */
export function PaneHeader({
  icon,
  title,
  meta,
  children,
}: {
  icon?: IconName | string;
  title: string;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-ink-700 bg-ink-850/70 px-2.5">
      {icon && <Icon name={icon} size={13} className="text-ink-400" />}
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-300">
        {title}
      </span>
      {meta && <span className="truncate text-[11px] text-ink-400">{meta}</span>}
      <div className="flex-1" />
      {children}
    </div>
  );
}

export function EmptyState({
  icon = 'sparkles',
  title,
  hint,
  children,
}: {
  icon?: IconName | string;
  title: string;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="aurora flex h-12 w-12 items-center justify-center rounded-xl border border-ink-700 text-ink-400">
        <Icon name={icon} size={20} />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-[13px] font-medium text-ink-100">{title}</p>
        {hint && <p className="text-[11.5px] leading-relaxed text-ink-400">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  icon?: IconName | string;
  tone?: 'neutral' | 'accent' | 'ok' | 'danger';
}) {
  const tint = {
    neutral: 'text-ink-200',
    accent: 'text-forge-500',
    ok: 'text-ok',
    danger: 'text-danger',
  }[tone];
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-ink-700 bg-ink-850 px-2.5 py-1.5">
      {icon && <Icon name={icon} size={14} className="text-ink-500" />}
      <div className="min-w-0">
        <p className="truncate text-[10px] uppercase tracking-wider text-ink-400">{label}</p>
        <p className={`truncate text-[12px] font-medium tabular-nums ${tint}`}>{value}</p>
      </div>
    </div>
  );
}

/** Copies text and confirms inline — no toast for something this small. */
export function CopyButton({
  text,
  title = 'Copy',
  size = 'sm',
}: {
  text: string;
  title?: string;
  size?: Size;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <IconButton
      icon={copied ? 'check' : 'copy'}
      size={size}
      title={copied ? 'Copied' : title}
      className={copied ? 'text-ok' : ''}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
    />
  );
}

/* --- modal ---------------------------------------------------------------- */

export function Modal({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  width = 'w-[620px]',
}: {
  title: string;
  subtitle?: ReactNode;
  icon?: IconName | string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="animate-fade fixed inset-0 z-50 flex items-start justify-center bg-ink-900/70 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (!panelRef.current?.contains(e.target as Node)) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={panelRef}
        className={`animate-pop shadow-float max-h-[76vh] overflow-hidden rounded-xl border border-ink-600 bg-ink-850 ${width}`}
      >
        <div className="flex items-center gap-2 border-b border-ink-700 px-3.5 py-2.5">
          {icon && (
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-forge-500/12 text-forge-500">
              <Icon name={icon} size={14} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink-50">{title}</p>
            {subtitle && <p className="truncate text-[11px] text-ink-400">{subtitle}</p>}
          </div>
          <IconButton icon="close" title="Close (Esc)" onClick={onClose} />
        </div>
        <div className="max-h-[58vh] overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex items-center gap-2 border-t border-ink-700 bg-ink-800/50 px-3.5 py-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* --- toasts --------------------------------------------------------------- */

export type Toast = {
  id: number;
  tone: 'info' | 'ok' | 'error';
  text: string;
  detail?: string;
};

type ToastApi = {
  push: (toast: Omit<Toast, 'id'>) => void;
  ok: (text: string, detail?: string) => void;
  error: (text: string, detail?: string) => void;
  info: (text: string, detail?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Replaces the old pattern of dropping errors into whichever panel happened to
 * be open. Actions fire from the board, the palette, and the detail view, so
 * their feedback has to live above all three.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), toast.tone === 'error' ? 8000 : 4000);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      ok: (text, detail) => push({ tone: 'ok', text, detail }),
      error: (text, detail) => push({ tone: 'error', text, detail }),
      info: (text, detail) => push({ tone: 'info', text, detail }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`animate-pop shadow-float pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 ${
              toast.tone === 'error'
                ? 'border-danger/35 bg-ink-850 text-danger'
                : toast.tone === 'ok'
                  ? 'border-ok/35 bg-ink-850 text-ok'
                  : 'border-ink-600 bg-ink-850 text-ink-200'
            }`}
          >
            <Icon
              name={toast.tone === 'error' ? 'alert' : toast.tone === 'ok' ? 'checkCircle' : 'info'}
              size={14}
              className="mt-px"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium leading-snug">{toast.text}</p>
              {toast.detail && (
                <p className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[10.5px] leading-snug text-ink-400">
                  {toast.detail}
                </p>
              )}
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="rounded p-0.5 text-ink-500 hover:text-ink-100"
              aria-label="Dismiss"
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}

/* --- confirm -------------------------------------------------------------- */

export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  tone = 'danger',
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  tone?: Tone;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={title}
      icon="alert"
      onClose={onClose}
      width="w-[440px]"
      footer={
        <>
          <Button
            tone={tone}
            busy={busy}
            onClick={() => {
              setBusy(true);
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
          <Button tone="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="px-3.5 py-3 text-[12px] leading-relaxed text-ink-200">{body}</div>
    </Modal>
  );
}
