import React from 'react';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'magic';
  size?: 'sm' | 'md' | 'lg';
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-45 disabled:pointer-events-none select-none cursor-pointer';
  const variants: Record<string, string> = {
    primary:
      'bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 text-white shadow-lg shadow-indigo-500/20 hover:brightness-110 border border-white/10',
    magic:
      'bg-gradient-to-r from-fuchsia-600 via-violet-600 to-indigo-600 text-white shadow-lg shadow-fuchsia-500/25 hover:brightness-110 border border-fuchsia-400/30',
    secondary:
      'bg-white/[0.07] text-slate-100 hover:bg-white/[0.12] border border-white/10 backdrop-blur-md',
    outline:
      'border border-white/15 bg-transparent text-slate-200 hover:bg-white/[0.06] hover:border-white/25',
    danger:
      'bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25',
    ghost:
      'bg-transparent text-slate-400 hover:bg-white/[0.06] hover:text-white',
  };
  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };
  return (
    <button
      type={type}
      disabled={disabled}
      className={`${base} ${variants[variant] || variants.primary} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-[#0d101b]/85 backdrop-blur-xl text-slate-100 shadow-xl ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  variant = 'default',
  className = '',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}) {
  const styles: Record<string, string> = {
    default: 'bg-white/[0.07] text-slate-300 border-white/10',
    success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    danger: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    info: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Input({
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-white/10 bg-[#070911]/90 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 ${className}`}
      {...props}
    />
  );
}

export function Textarea({
  className = '',
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-xl border border-white/10 bg-[#070911]/90 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 ${className}`}
      {...props}
    />
  );
}

export function Progress({ value, className = '' }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-2.5 w-full overflow-hidden rounded-full bg-white/[0.07] ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-400 transition-all duration-300"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.06] ${className}`} />;
}
