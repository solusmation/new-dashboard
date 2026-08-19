import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/voucher")({
  component: VoucherLayout,
});

function VoucherLayout() {
  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      <Outlet />
    </div>
  );
}
