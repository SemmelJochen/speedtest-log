import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Sidebar, MobileNav } from '@/components/ui/navigation';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 pb-16 md:pb-0">
        <Outlet />
      </main>
      <MobileNav />
    </div>
  );
}
