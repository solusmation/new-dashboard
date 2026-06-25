import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/fnb")({
  component: FnbLayout,
});

const tabs = [
  { to: "/admin/fnb", label: "Menu", exact: true },
  { to: "/admin/fnb/transaksi", label: "Transaksi", exact: false },
] as const;

function FnbSubnav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex gap-1 border-b border-border mb-6">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.to
          : pathname === tab.to || pathname.startsWith(`${tab.to}/`);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

function FnbLayout() {
  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      <header className="mb-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">FnB</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Kelola menu makanan & minuman serta transaksi pembelian pengguna.
        </p>
      </header>
      <FnbSubnav />
      <Outlet />
    </div>
  );
}
