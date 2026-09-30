"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

const POLL_MS = 60_000;

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** In-app notifications (lease sent/signed, etc.), polled every minute. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications").catch(() => null);
    if (!res?.ok) return;
    const body = await res.json();
    setItems(body.notifications ?? []);
    setUnread(body.unread ?? 0);
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} className="relative p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-3 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
          <p className="px-4 py-3 text-sm font-semibold border-b border-border">Notifications</p>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">You&apos;re all caught up.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-border">
              {items.map((n) => {
                const content = (
                  <div className={cn("px-4 py-3 text-sm", !n.is_read && "bg-brand/5")}>
                    <p className="font-medium">{n.title}</p>
                    {n.body && <p className="text-muted-foreground mt-0.5">{n.body}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} onClick={() => setOpen(false)} className="block hover:bg-slate-50 dark:hover:bg-slate-800">{content}</Link>
                    ) : content}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
