import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type {
  ModeratorWaitlistCount,
  ModeratorWaitlistRequest,
} from "@repo/shared";
import { api } from "@/lib/api";
import { Reveal } from "@/components/landing/Reveal";
import { Button } from "@/components/ui/Button";

/**
 * "Run a moderator" — the waitlist for third-party operators.
 *
 * Self-contained: its own fetch, its own state, and it imports nothing from the
 * contract flow. If the api doesn't answer, the count is simply hidden and the
 * form still works.
 */

export function ModeratorWaitlist() {
  const [count, setCount] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", contact: "", model: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ModeratorWaitlistCount>("/waitlist/moderators")
      .then((r) => setCount(r.count))
      .catch(() => setCount(null));
  }, []);

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));
  const ready = form.name.trim().length >= 2 && form.contact.trim().length >= 3;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Typed against the shared request shape, so a field renamed on the api
      // fails to compile here rather than silently posting the wrong body.
      const body: ModeratorWaitlistRequest = {
        name: form.name.trim(),
        contact: form.contact.trim(),
        model: form.model.trim() || undefined,
        note: form.note.trim() || undefined,
      };
      const r = await api.post<ModeratorWaitlistCount>("/waitlist/moderators", body);
      setCount(r.count);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <Reveal className="max-w-2xl">
        <div className="label">Run a moderator</div>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-balance md:text-[2.2rem] md:leading-[1.1]">
          Bring <span className="text-gradient">your own judge</span>
        </h2>
        {/* The honest version — a visitor can see the moderators above share one
            operator, so claiming otherwise only loses them. */}
        <p className="mt-3 text-muted">
          Every moderator above is operated by us today. A moderator is not
          privileged code — it's a wallet, a model and a price, and the protocol
          doesn't care who holds them. V2 opens registration to anyone.
        </p>
        {/* Hidden at zero — "0 operators have joined" is an argument against
            signing up. From one upward it's a fact worth stating. */}
        {count !== null && count > 0 && (
          <p className="mt-4 text-sm text-muted">
            <span className="text-lg font-semibold text-ink">{count}</span>{" "}
            {count === 1 ? "operator has" : "operators have"} joined the
            waitlist.
          </p>
        )}
      </Reveal>

      <Reveal delay={90}>
        <div className="glass p-6">
          {done ? (
            <div className="flex flex-col items-start gap-3 py-6">
              <span className="grid size-10 place-items-center rounded-xl border border-pass/30 bg-pass/10">
                <Check className="size-5 text-pass" />
              </span>
              <div className="text-lg font-semibold tracking-[-0.02em]">
                You're on the list.
              </div>
              <p className="text-sm text-muted">
                We'll get in touch when registration opens, with the wallet setup
                and the container you'd run.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="wl-name" className="label block">
                    You or your lab
                  </label>
                  <input
                    id="wl-name"
                    className="inp"
                    placeholder="Kenobi Labs"
                    maxLength={80}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="wl-contact" className="label block">
                    Email or handle
                  </label>
                  <input
                    id="wl-contact"
                    className="inp"
                    placeholder="you@lab.xyz"
                    maxLength={200}
                    value={form.contact}
                    onChange={(e) => set("contact", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="wl-model" className="label block">
                    Model you'd judge with
                    <span className="ml-1.5 normal-case text-zinc-600">optional</span>
                  </label>
                  <input
                    id="wl-model"
                    className="inp"
                    placeholder="Claude Sonnet 5"
                    maxLength={80}
                    value={form.model}
                    onChange={(e) => set("model", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="wl-note" className="label block">
                  Anything else
                  <span className="ml-1.5 normal-case text-zinc-600">optional</span>
                </label>
                <textarea
                  id="wl-note"
                  rows={3}
                  className="inp resize-none"
                  placeholder="What you've built, what you'd evaluate well."
                  maxLength={500}
                  value={form.note}
                  onChange={(e) => set("note", e.target.value)}
                />
              </div>

              {error && <div className="text-sm text-fail">{error}</div>}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-md text-xs text-muted">
                  We only use your contact details to reach you about running a
                  moderator. Ask and we'll delete them.
                </p>
                <Button
                  type="submit"
                  variant="accent"
                  className="max-sm:w-full sm:px-8"
                  disabled={!ready || busy}
                >
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  {busy ? "Joining…" : "Join the waitlist"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Reveal>
    </section>
  );
}
