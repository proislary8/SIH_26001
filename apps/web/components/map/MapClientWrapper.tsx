"use client";
import dynamic from "next/dynamic";

// maplibre-gl v6 uses Web Workers which can't run on the server.
// This wrapper is a Client Component so ssr:false is allowed here.
const HeroMap = dynamic(() => import("@/components/map/HeroMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[420px] w-full rounded-2xl border border-white/10 bg-slate-900/60 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
        <span className="text-xs text-slate-400">Loading risk map…</span>
      </div>
    </div>
  ),
});

export default function MapClientWrapper(props: { mini?: boolean }) {
  return <HeroMap {...props} />;
}
