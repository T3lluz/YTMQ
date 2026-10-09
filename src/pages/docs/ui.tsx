import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** Turns a heading into the id its anchor links to. */
function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function H2({ children, id }: { children: string; id?: string }) {
  const anchor = id ?? slugify(children)
  return (
    <h2 id={anchor} data-toc className="group mt-14 scroll-mt-24 text-2xl font-extrabold tracking-[-0.02em] text-white first:mt-0">
      {children}
      <a href={`#${anchor}`} className="ml-2 text-neutral-600 opacity-0 transition-opacity hover:text-neutral-300 group-hover:opacity-100" aria-label={`Link to ${children}`}>
        #
      </a>
    </h2>
  )
}

export function H3({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="mt-8 scroll-mt-24 text-lg font-bold text-white">
      {children}
    </h3>
  )
}

export function P({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`mt-4 leading-7 text-neutral-300 ${className}`}>{children}</p>
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-lg leading-8 text-neutral-400">{children}</p>
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="mt-4 list-disc space-y-2 pl-5 leading-7 text-neutral-300 marker:text-neutral-600">{children}</ul>
}

export function OL({ children }: { children: ReactNode }) {
  return <ol className="mt-4 list-decimal space-y-2 pl-5 leading-7 text-neutral-300 marker:text-neutral-500">{children}</ol>
}

export function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-white">{children}</strong>
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.85em] text-neutral-100">{children}</code>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.6rem] items-center justify-center rounded-md border border-white/15 border-b-white/25 bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs font-medium text-neutral-100">
      {children}
    </kbd>
  )
}

export function A({ to, children }: { to: string; children: ReactNode }) {
  const cls = 'font-medium text-white underline decoration-accent-500/60 decoration-2 underline-offset-4 transition-colors hover:decoration-accent-400'
  if (/^https?:/.test(to) || to.startsWith('mailto:')) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    )
  }
  return (
    <Link to={to} className={cls}>
      {children}
    </Link>
  )
}

type CalloutTone = 'note' | 'tip' | 'warn'
const TONES: Record<CalloutTone, { bar: string; label: string }> = {
  note: { bar: 'bg-neutral-500', label: 'Note' },
  tip: { bar: 'bg-emerald-400', label: 'Tip' },
  warn: { bar: 'bg-amber-400', label: 'Heads up' },
}

export function Callout({ tone = 'note', title, children }: { tone?: CalloutTone; title?: string; children: ReactNode }) {
  const t = TONES[tone]
  return (
    <aside className="relative mt-6 overflow-hidden rounded-2xl bg-white/[0.04] py-4 pl-5 pr-4">
      <span className={`absolute inset-y-0 left-0 w-1 ${t.bar}`} aria-hidden />
      <p className="text-sm font-bold text-white">{title ?? t.label}</p>
      <div className="mt-1 text-sm leading-6 text-neutral-300 [&_p]:mt-2 [&_p:first-child]:mt-0">{children}</div>
    </aside>
  )
}

export function CopyButton({ value, label = 'Copy', className = '' }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        })
      }}
      className={`ytmq-press rounded-full px-2.5 py-1 text-xs font-semibold text-neutral-400 transition-colors hover:bg-white/10 hover:text-white ${className}`}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

export function CodeBlock({ children, lang, title }: { children: string; lang?: string; title?: string }) {
  const code = children.replace(/^\n/, '').replace(/\n\s*$/, '')
  return (
    <figure className="mt-5 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0f0f0f]">
      <figcaption className="flex items-center justify-between border-b border-white/[0.06] py-1.5 pl-4 pr-2 text-xs text-neutral-500">
        <span className="font-mono">{title ?? lang ?? 'text'}</span>
        <CopyButton value={code} />
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6 text-neutral-200">
        <code>{code}</code>
      </pre>
    </figure>
  )
}

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="relative mt-6 space-y-8 [counter-reset:step]">{children}</ol>
}

export function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="relative pl-12 [counter-increment:step] before:absolute before:left-0 before:top-0 before:flex before:h-8 before:w-8 before:items-center before:justify-center before:rounded-full before:bg-white before:text-sm before:font-extrabold before:text-neutral-950 before:content-[counter(step)] after:absolute after:bottom-[-1.75rem] after:left-[15px] after:top-10 after:w-0.5 after:rounded-full after:bg-white/10 last:after:hidden">
      <h3 className="pt-0.5 text-base font-bold text-white">{title}</h3>
      <div className="mt-1.5 space-y-3 text-[15px] leading-7 text-neutral-400 [&_p]:mt-0">{children}</div>
    </li>
  )
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-2xl border border-white/[0.07]">
      <table className="w-full min-w-[32rem] text-left text-sm">
        {head.some(Boolean) && (
          <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.08em] text-neutral-500">
            <tr>
              {head.map((h, i) => (
                <th key={i} className="px-4 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-white/[0.06] text-neutral-300">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 align-top leading-6">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Figure({ children, caption, className = '' }: { children: ReactNode; caption?: ReactNode; className?: string }) {
  return (
    <figure className={`mt-6 ${className}`}>
      <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#0f0f0f] p-4 sm:p-6">{children}</div>
      {caption && <figcaption className="mt-2.5 text-sm text-neutral-500">{caption}</figcaption>}
    </figure>
  )
}

export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="mt-6 grid gap-3 sm:grid-cols-2">{children}</div>
}

export function Card({ to, title, children }: { to: string; title: string; children: ReactNode }) {
  return (
    <Link to={to} className="group block rounded-2xl bg-white/[0.04] p-5 transition-colors hover:bg-white/[0.07]">
      <p className="flex items-center justify-between font-bold text-white">
        {title}
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-neutral-500 transition-transform group-hover:translate-x-0.5 group-hover:text-white" aria-hidden>
          <path d="M4 10h12" />
          <path d="m11 5 5 5-5 5" />
        </svg>
      </p>
      <p className="mt-1 text-sm leading-6 text-neutral-400">{children}</p>
    </Link>
  )
}
