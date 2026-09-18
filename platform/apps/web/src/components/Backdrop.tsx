import { useEffect, useRef } from "react";

/**
 * The aurora behind every page: a few large, slow, blurred colour fields on a
 * canvas, plus a faint grid and grain. Kept deliberately dim — it is ambience,
 * not content. Canvas rather than WebGL: cheap, and frozen for reduced motion.
 */
export function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const blobs = [
      { c: "139,92,255", x: 0.18, y: 0.08, r: 0.55, s: 0.00016 },
      { c: "54,224,211", x: 0.86, y: 0.2, r: 0.45, s: -0.00012 },
      { c: "106,125,255", x: 0.55, y: 0.95, r: 0.5, s: 0.0001 },
    ];
    let w = 0, h = 0, raf = 0;
    const size = () => {
      // Half resolution: it is a blur, nobody can see the difference.
      w = cv.width = Math.floor(innerWidth * 0.5);
      h = cv.height = Math.floor(innerHeight * 0.5);
    };
    size();
    addEventListener("resize", size);

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const b of blobs) {
        const x = (b.x + Math.sin(t * b.s * 6) * 0.07) * w;
        const y = (b.y + Math.cos(t * b.s * 6) * 0.07) * h;
        const r = b.r * Math.max(w, h);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${b.c},0.16)`);
        g.addColorStop(1, `rgba(${b.c},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      if (!reduce && !document.hidden) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const onVis = () => {
      if (!document.hidden && !reduce) raf = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", size);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <canvas ref={ref} className="absolute inset-0 size-full" />
      {/* grid, fading out away from the top */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 70% 55% at 50% 0%, #000 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 55% at 50% 0%, #000 30%, transparent 75%)",
        }}
      />
      {/* grain */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
    </div>
  );
}
