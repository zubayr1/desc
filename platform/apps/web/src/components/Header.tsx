import { Link } from "react-router-dom";
import { ConnectButton } from "./ConnectButton";

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-white/5 bg-bg/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="btn-accent grid size-7 place-items-center rounded-lg text-xs text-white">
            ◆
          </span>
          desc
        </Link>
        <ConnectButton />
      </div>
    </header>
  );
}
