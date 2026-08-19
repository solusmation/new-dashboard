"use client";

import * as React from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutGrid,
  Users,
  GraduationCap,
  CalendarDays,
  BookOpen,
  Swords,
  Trophy,
  UtensilsCrossed,
  Ticket,
  Gift,
  Bell,
  Settings,
  LogOut,
  Leaf,
  Hourglass,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const SIDEBAR_OPEN_KEY = "admin-sidebar-open";

type NavLeaf = { to: string; label: string; icon?: LucideIcon; textIcon?: string };
type NavGroupItem = NavLeaf | { label: string; icon?: LucideIcon; children: ReadonlyArray<NavLeaf> };

function isLeaf(item: NavGroupItem): item is NavLeaf {
  return "to" in item;
}

const groups: ReadonlyArray<{
  label: string;
  items: ReadonlyArray<NavGroupItem>;
}> = [
  {
    label: "Operasional",
    items: [
      { to: "/admin/keuangan", label: "Keuangan", icon: LayoutGrid },
      { to: "/admin/fnb", label: "FnB", icon: UtensilsCrossed },
      { to: "/admin/voucher", label: "Voucher", icon: Ticket },
      { to: "/admin/reward", label: "Reward", icon: Gift },
      { to: "/admin/coach", label: "Coach", icon: GraduationCap },
      { to: "/admin/pengguna", label: "Pengguna", icon: Users },
      {
        label: "Coming Soon",
        icon: Hourglass,
        children: [
          { to: "/admin/tournament", label: "Tournament", icon: Trophy },
          { to: "/admin/reservasi", label: "Reservasi", icon: CalendarDays },
          { to: "/admin/program", label: "Program", icon: BookOpen },
          { to: "/admin/match", label: "Match", icon: Swords },
        ],
      },
    ],
  },
  {
    label: "Sistem",
    items: [
      { to: "/admin/ai-assistant", label: "AI Assistant", textIcon: "AI" },
      { to: "/admin/notifikasi", label: "Notifikasi", icon: Bell },
      { to: "/admin/pengaturan", label: "Pengaturan", icon: Settings },
    ],
  },
];

function pathActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function NavIcon({
  icon: Icon,
  textIcon,
}: {
  icon?: LucideIcon;
  textIcon?: string;
}) {
  if (textIcon) {
    return (
      <span className="text-[11px] font-bold leading-none tracking-tight" aria-hidden>
        {textIcon}
      </span>
    );
  }
  if (Icon) {
    return <Icon className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />;
  }
  return null;
}

function NavItemLink({
  item,
  active,
  expanded,
  nested,
}: {
  item: NavLeaf;
  active: boolean;
  expanded: boolean;
  nested?: boolean;
}) {
  const link = (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center rounded-xl text-admin-sidebar-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-admin-sidebar-muted/60",
        expanded ? "h-10 w-full gap-3 px-3" : "size-10 justify-center",
        nested && expanded && "h-9 pl-4",
        active
          ? "bg-admin-sidebar-active text-admin-sidebar-foreground"
          : "text-admin-sidebar-muted hover:bg-admin-sidebar-active/55 hover:text-admin-sidebar-foreground",
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">
        <NavIcon icon={item.icon} textIcon={item.textIcon} />
      </span>
      {expanded ? (
        <span className="truncate text-sm font-medium">{item.label}</span>
      ) : (
        <span className="sr-only">{item.label}</span>
      )}
    </Link>
  );

  if (expanded) {
    return <li>{link}</li>;
  }

  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          {item.label}
        </TooltipContent>
      </Tooltip>
    </li>
  );
}

function ComingSoonMenu({
  label,
  icon,
  items,
  pathname,
  expanded,
}: {
  label: string;
  icon?: LucideIcon;
  items: ReadonlyArray<NavLeaf>;
  pathname: string;
  expanded: boolean;
}) {
  const childActive = items.some((c) => pathActive(pathname, c.to));
  const [open, setOpen] = React.useState(childActive);

  React.useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  React.useEffect(() => {
    if (!expanded) setOpen(false);
  }, [expanded]);

  React.useEffect(() => {
    if (expanded || !open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, open]);

  const triggerClass = cn(
    "flex items-center rounded-xl text-admin-sidebar-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-admin-sidebar-muted/60",
    expanded ? "h-10 w-full gap-3 px-3" : "size-10 justify-center",
    childActive || open
      ? "bg-admin-sidebar-active text-admin-sidebar-foreground"
      : "text-admin-sidebar-muted hover:bg-admin-sidebar-active/55 hover:text-admin-sidebar-foreground",
  );

  const trigger = (
    <button
      type="button"
      className={triggerClass}
      aria-expanded={open}
      aria-label={label}
      onClick={() => setOpen((v) => !v)}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">
        <NavIcon icon={icon} />
      </span>
      {expanded ? (
        <>
          <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">{label}</span>
          <ChevronDown
            className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
            strokeWidth={1.75}
            aria-hidden
          />
        </>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </button>
  );

  if (expanded) {
    return (
      <li>
        {trigger}
        {open ? (
          <ul className="mt-1 ml-2 flex flex-col gap-1 border-l border-admin-sidebar-active/55 pl-2">
            {items.map((child) => (
              <NavItemLink
                key={child.to}
                item={child}
                active={pathActive(pathname, child.to)}
                expanded
                nested
              />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }

  return (
    <li className="relative">
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        {!open ? (
          <TooltipContent side="right" className="font-medium">
            {label}
          </TooltipContent>
        ) : null}
      </Tooltip>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Tutup submenu"
            onClick={() => setOpen(false)}
          />
          <ul className="absolute left-full top-0 z-50 ml-2 min-w-[11rem] rounded-xl border border-admin-sidebar-active/55 bg-admin-sidebar p-1.5 shadow-lg">
            {items.map((child) => (
              <li key={child.to}>
                <Link
                  to={child.to}
                  onClick={() => setOpen(false)}
                  aria-current={pathActive(pathname, child.to) ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors",
                    pathActive(pathname, child.to)
                      ? "bg-admin-sidebar-active text-admin-sidebar-foreground"
                      : "text-admin-sidebar-muted hover:bg-admin-sidebar-active/55 hover:text-admin-sidebar-foreground",
                  )}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    <NavIcon icon={child.icon} />
                  </span>
                  {child.label}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </li>
  );
}

function LogoutButton({ expanded }: { expanded: boolean }) {
  const navigate = useNavigate();

  const button = (
    <button
      type="button"
      onClick={async () => {
        await supabase.auth.signOut();
        navigate({ to: "/login" });
      }}
      className={cn(
        "mt-2 flex items-center rounded-xl text-admin-sidebar-muted transition-colors hover:bg-admin-sidebar-active/55 hover:text-admin-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-sidebar-muted/60",
        expanded ? "h-10 w-full gap-3 px-3" : "size-10 justify-center",
      )}
      aria-label="Keluar"
    >
      <LogOut className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
      {expanded ? <span className="text-sm font-medium">Keluar</span> : null}
    </button>
  );

  if (expanded) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">Keluar</TooltipContent>
    </Tooltip>
  );
}

export function AdminSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    try {
      setExpanded(localStorage.getItem(SIDEBAR_OPEN_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  function toggleExpanded() {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_OPEN_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <TooltipProvider delayDuration={180}>
      <aside
        className={cn(
          "sticky top-0 flex h-screen shrink-0 flex-col border-r border-admin-sidebar-active/35 bg-admin-sidebar text-admin-sidebar-foreground transition-[width] duration-200 ease-out",
          expanded ? "w-56" : "w-[4.25rem]",
        )}
        aria-label="Navigasi admin"
      >
        <div
          className={cn(
            "flex h-full w-full flex-col pb-4 pt-1",
            expanded ? "items-stretch px-3" : "items-center px-2",
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleExpanded}
                className={cn(
                  "mb-4 flex size-11 shrink-0 items-center justify-center rounded-xl bg-admin-sidebar-logo-bg text-admin-sidebar-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-sidebar-muted/70",
                  expanded && "self-start",
                )}
                aria-label={expanded ? "Tutup sidebar" : "Buka sidebar"}
                aria-expanded={expanded}
              >
                <Leaf className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{expanded ? "Tutup menu" : "Buka menu"}</TooltipContent>
          </Tooltip>

          <nav className="flex w-full min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {groups.map((g, gi) => (
              <React.Fragment key={g.label}>
                {gi > 0 ? (
                  <div
                    className={cn(
                      "h-px shrink-0 bg-admin-sidebar-active/55",
                      expanded ? "mx-1 w-auto" : "w-8 self-center",
                    )}
                    aria-hidden
                  />
                ) : null}
                {expanded ? (
                  <p className="px-3 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-admin-sidebar-muted">
                    {g.label}
                  </p>
                ) : null}
                <ul className={cn("flex flex-col gap-1.5", expanded ? "items-stretch" : "items-center")}>
                  {g.items.map((it) => {
                    if (!isLeaf(it)) {
                      return (
                        <ComingSoonMenu
                          key={it.label}
                          label={it.label}
                          icon={it.icon}
                          items={it.children}
                          pathname={pathname}
                          expanded={expanded}
                        />
                      );
                    }
                    return (
                      <NavItemLink
                        key={it.to}
                        item={it}
                        active={pathActive(pathname, it.to)}
                        expanded={expanded}
                      />
                    );
                  })}
                </ul>
              </React.Fragment>
            ))}
          </nav>

          <LogoutButton expanded={expanded} />
        </div>
      </aside>
    </TooltipProvider>
  );
}
