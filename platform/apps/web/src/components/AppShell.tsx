import { Outlet } from "react-router-dom";
import { Header } from "./Header";

export function AppShell() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
