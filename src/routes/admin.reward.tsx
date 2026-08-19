import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/reward")({
  component: RewardLayout,
});

function RewardLayout() {
  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      <Outlet />
    </div>
  );
}
