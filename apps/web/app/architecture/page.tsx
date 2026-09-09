"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Download, Shield, Layers, Cpu, Database, Smartphone, Radio } from "lucide-react";

export default function ArchitecturePage() {
  const downloadDiagram = () => {
    const link = document.createElement("a");
    link.href = "/landguard_system_architecture.png";
    link.download = "LandGuard_NER_System_Architecture.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#030712", color: "#e2e8f0", fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <header style={{
        borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(3,7,18,0.95)",
        backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
            <ArrowLeft size={16} /> Back to Home
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={downloadDiagram}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 100,
                background: "linear-gradient(135deg, #06b6d4, #3b82f6)", border: "none", color: "white",
                fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 16px rgba(6,182,212,0.3)",
              }}
            >
              <Download size={14} /> Download Diagram (PNG)
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 20px" }}>

        {/* Page Header */}
        <div style={{ marginBottom: 36, textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 16px", borderRadius: 100, background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", color: "#60a5fa", fontSize: 11, fontWeight: 700, marginBottom: 16 }}>
            <Layers size={13} /> LandGuard NER · Technical System Architecture
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 900, color: "white", marginBottom: 12, letterSpacing: "-0.02em" }}>
            Clean Developer Architecture Diagram
          </h1>
          <p style={{ fontSize: 14, color: "#94a3b8", maxWidth: 640, margin: "0 auto", lineHeight: 1.6 }}>
            Minimal, human-made engineering block diagram with a transparent background — perfect for pitch decks, hackathon submissions, and developer documentation.
          </p>

          <div style={{ marginTop: 20 }}>
            <button
              onClick={downloadDiagram}
              style={{
                display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 28px", borderRadius: 100,
                background: "white", color: "black", fontSize: 14, fontWeight: 800, cursor: "pointer",
                boxShadow: "0 4px 24px rgba(255,255,255,0.15)", border: "none",
              }}
            >
              <Download size={16} /> Download Transparent Diagram (PNG)
            </button>
          </div>
        </div>

        {/* Visual Diagram Image */}
        <div style={{ borderRadius: 24, overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 25px 60px rgba(0,0,0,0.8)", marginBottom: 48, background: "rgba(255,255,255,0.02)", padding: "20px" }}>
          <img
            src="/landguard_system_architecture.png"
            alt="LandGuard NER Clean Transparent System Architecture Diagram"
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>

        {/* 5 Architecture Layers Breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginBottom: 48 }}>

          {/* Layer 1 */}
          <div style={{ padding: "24px", borderRadius: 20, background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#06b6d4", fontWeight: 900 }}>1</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#06b6d4", textTransform: "uppercase", letterSpacing: "0.06em" }}>Input Layer</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>Data Sources & Ingestion</div>
              </div>
            </div>
            <ul style={{ paddingLeft: 18, fontSize: 12, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>
              <li><strong>Copernicus ESA (Sentinel-1)</strong>: Radar SAR slope displacement</li>
              <li><strong>Open-Meteo API</strong>: Live weather & 72h rainfall accumulation</li>
              <li><strong>NASA SRTM</strong>: 30m Digital Elevation Model slopes</li>
              <li><strong>IoT Sensors & Citizen Field Reports</strong>: Ground tilt & geotagged photos</li>
            </ul>
          </div>

          {/* Layer 2 */}
          <div style={{ padding: "24px", borderRadius: 20, background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#c084fc", fontWeight: 900 }}>2</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#c084fc", textTransform: "uppercase", letterSpacing: "0.06em" }}>Intelligence Layer</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>Python AI & ML Core</div>
              </div>
            </div>
            <ul style={{ paddingLeft: 18, fontSize: 12, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>
              <li><strong>FastAPI Microservice Engine</strong>: High-speed predictions</li>
              <li><strong>XGBoost / Random Forest Model</strong>: 94%+ hazard accuracy</li>
              <li><strong>InSAR Radar Processor</strong>: Detects millimeter land movement</li>
              <li><strong>What-If Simulator Engine</strong>: Stress-tests heavy rain scenarios</li>
            </ul>
          </div>

          {/* Layer 3 */}
          <div style={{ padding: "24px", borderRadius: 20, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#4ade80", fontWeight: 900 }}>3</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.06em" }}>Persistence Layer</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>Supabase PostGIS Database</div>
              </div>
            </div>
            <ul style={{ paddingLeft: 18, fontSize: 12, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>
              <li><strong>PostgreSQL + PostGIS</strong>: Geospatial risk polygon queries</li>
              <li><strong>Nearest Shelter Lookup</strong>: Real-time ST_DWithin calculation</li>
              <li><strong>Row-Level Security (RLS)</strong>: Multi-role authentication</li>
              <li><strong>Offline Sync Buffer</strong>: Caches user hazard reports</li>
            </ul>
          </div>

          {/* Layer 4 */}
          <div style={{ padding: "24px", borderRadius: 20, background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fb923c", fontWeight: 900 }}>4</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#fb923c", textTransform: "uppercase", letterSpacing: "0.06em" }}>Presentation Layer</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>Next.js 16 Web Application</div>
              </div>
            </div>
            <ul style={{ paddingLeft: 18, fontSize: 12, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>
              <li><strong>Mobile Responsive UI</strong>: Bottom navigation bar & touch controls</li>
              <li><strong>Interactive Risk Map</strong>: ArcGIS & MapLibre GL color overlays</li>
              <li><strong>Public Alerts & Shelters</strong>: Verified camps with food & medical aid</li>
              <li><strong>NDRF/SDMA Dashboard</strong>: Multi-district command center</li>
            </ul>
          </div>

          {/* Layer 5 */}
          <div style={{ padding: "24px", borderRadius: 20, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#f87171", fontWeight: 900 }}>5</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.06em" }}>Notification Layer</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>Alert Dispatch Gateway</div>
              </div>
            </div>
            <ul style={{ paddingLeft: 18, fontSize: 12, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>
              <li><strong>Regional Language SMS</strong>: Assamese, Mizo, Manipuri, Bengali</li>
              <li><strong>One-Tap Emergency SOS</strong>: Direct NDRF control room dispatch</li>
              <li><strong>Live Broadcast Banner</strong>: Real-time public emergency alerts</li>
              <li><strong>Road Block Advisories</strong>: Alternate route recommendations</li>
            </ul>
          </div>

        </div>

      </main>
    </div>
  );
}
