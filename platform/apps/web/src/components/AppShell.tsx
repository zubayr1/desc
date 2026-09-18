import { Outlet } from "react-router-dom";
import { Backdrop } from "./Backdrop";
import { Header } from "./Header";
import { Footer } from "./Footer";

export function AppShell() {
  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <Backdrop />
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
