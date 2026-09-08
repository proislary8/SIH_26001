"use client";
import dynamic from "next/dynamic";

function MapLoading() {
  return (
    <div className="w-full h-screen bg-[#030712] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-white/5 border-t-orange-500 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center text-2xl">{'\u{1F3D4}\uFE0F'}</div>
        </div>
        <p className="text-slate-400 text-sm">Loading NER Live Map</p>
        <p className="text-slate-600 text-xs">All 8 states - All districts</p>
      </div>
    </div>
  );
}

// NERMap uses MapLibre GL (Web Workers) - must be client-only
const NERMap = dynamic(() => import("@/components/map/NERMap"), {
  ssr: false,
  loading: () => <MapLoading />,
});

export default function MapPage() {
  return <NERMap />;
}
