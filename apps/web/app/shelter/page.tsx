"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Shield, MapPin, Phone, Users, Home, Search, ArrowLeft, AlertTriangle, Navigation, CheckCircle, Utensils } from "lucide-react";

const SHELTERS = [
  {
    id: "s1",
    name: "Haflong High School Relief Center",
    state: "Assam",
    district: "Dima Hasao",
    address: "Station Road, Haflong town",
    capacity: 450,
    occupied: 120,
    status: "Open",
    contact: "+91 3673 236214",
    medical_facility: true,
    food_supply: "Sufficient (7 days)",
    distance_km: 8,
    lat: 25.17,
    lng: 93.02,
    alerts_nearby: 2,
  },
  {
    id: "s2",
    name: "Aizawl Community Hall Evacuation Hub",
    state: "Mizoram",
    district: "Aizawl",
    address: "Khatla Veng, Near Multi-Purpose Complex",
    capacity: 600,
    occupied: 280,
    status: "Open",
    contact: "+91 389 2322234",
    medical_facility: true,
    food_supply: "Sufficient (10 days)",
    distance_km: 5,
    lat: 23.73,
    lng: 92.71,
    alerts_nearby: 1,
  },
  {
    id: "s3",
    name: "Gangtok Indoor Stadium Relief Camp",
    state: "Sikkim",
    district: "Gangtok",
    address: "Paljor Stadium Complex, Gangtok",
    capacity: 800,
    occupied: 95,
    status: "Open",
    contact: "+91 3592 202022",
    medical_facility: true,
    food_supply: "Sufficient (14 days)",
    distance_km: 15,
    lat: 27.33,
    lng: 88.61,
    alerts_nearby: 0,
  },
  {
    id: "s4",
    name: "Shillong Civil Defense Shelter",
    state: "Meghalaya",
    district: "East Khasi Hills",
    address: "Laitumkhrah, Shillong",
    capacity: 500,
    occupied: 140,
    status: "Open",
    contact: "+91 364 2224444",
    medical_facility: true,
    food_supply: "Sufficient (5 days)",
    distance_km: 22,
    lat: 25.57,
    lng: 91.88,
    alerts_nearby: 0,
  },
  {
    id: "s5",
    name: "Tamenglong Relief Camp",
    state: "Manipur",
    district: "Tamenglong",
    address: "District Sports Complex",
    capacity: 350,
    occupied: 210,
    status: "Open",
    contact: "+91 3877 262224",
    medical_facility: false,
    food_supply: "Replenishing (2 days)",
    distance_km: 34,
    lat: 24.98,
    lng: 93.49,
    alerts_nearby: 1,
  },
];

const EMERGENCY_STEPS = [
  { icon: "🚨", step: "Feel unsafe?", action: "Call NDMA: 1078 immediately" },
  { icon: "🏠", step: "Find a shelter", action: "Search below and call their number" },
  { icon: "🗺️", step: "Get directions", action: "Tap 'Navigate' — opens Google Maps" },
  { icon: "📸", step: "See a hazard?", action: "Report it to warn others" },
];

export default function ShelterPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedState, setSelectedState] = useState("All");

  const filteredShelters = SHELTERS.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.district.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.state.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesState = selectedState === "All" || s.state === selectedState;
    return matchesSearch && matchesState;
  });

  const occupancyPct = (s: typeof SHELTERS[0]) => Math.round((s.occupied / s.capacity) * 100);
  const availableSpots = (s: typeof SHELTERS[0]) => s.capacity - s.occupied;
  const occupancyColor = (pct: number) => pct > 80 ? "#ef4444" : pct > 50 ? "#f97316" : "#22c55e";

  return (
    <div style={{ minHeight: "100vh", background: "#030712", color: "#e2e8f0", fontFamily: "'Inter', system-ui, sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .shelter-card { transition: all 0.2s; }
        .shelter-card:hover { border-color: rgba(34,197,94,0.4) !important; transform: translateY(-3px); }
        .nav-btn { transition: all 0.15s; }
        .nav-btn:hover { background: rgba(59,130,246,0.2) !important; }
      `}</style>

      {/* Header */}
      <header style={{
        borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(3,7,18,0.95)",
        backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
            <ArrowLeft size={16} /> Back to Home
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Shield size={14} style={{ color: "#4ade80" }} />
            <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 700 }}>5 Active Relief Camps · Verified by SDMA</span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 20px" }}>

        {/* Page Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 100, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#4ade80", fontSize: 11, fontWeight: 700, marginBottom: 16 }}>
            <Home size={12} /> Safe Evacuation Shelters · NE India
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: "white", marginBottom: 10, letterSpacing: "-0.02em" }}>Find a Safe Shelter Near You</h1>
          <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>
            Government-approved relief camps with food, water, and medical aid. Call their contact number before heading out.
          </p>
        </div>

        {/* In an Emergency — 3 Steps Banner */}
        <div style={{ marginBottom: 32, padding: "20px", borderRadius: 20, background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <AlertTriangle size={18} style={{ color: "#f87171" }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: "#f87171" }}>If You Are in Immediate Danger — Do This Now</span>
          </div>
          <div className="emergency-steps-grid">
            {EMERGENCY_STEPS.map((s, i) => (
              <div key={i} style={{ padding: "12px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "white", marginBottom: 3 }}>{s.step}</div>
                <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.4 }}>{s.action}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Search & Filter */}
        <div className="shelter-search-row">
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#475569" }} />
            <input
              type="text"
              placeholder="Search by shelter name, district, or town (e.g. 'Aizawl', 'Sikkim', 'Gangtok')..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%", background: "#0a0f1d", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 14, padding: "12px 16px 12px 42px", fontSize: 14, color: "#e2e8f0",
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            style={{
              background: "#0a0f1d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14,
              padding: "12px 16px", fontSize: 13, color: "#e2e8f0", outline: "none", cursor: "pointer",
            }}
          >
            <option value="All">All States</option>
            <option value="Assam">Assam</option>
            <option value="Mizoram">Mizoram</option>
            <option value="Sikkim">Sikkim</option>
            <option value="Meghalaya">Meghalaya</option>
            <option value="Manipur">Manipur</option>
            <option value="Nagaland">Nagaland</option>
            <option value="Arunachal Pradesh">Arunachal Pradesh</option>
            <option value="Tripura">Tripura</option>
          </select>
        </div>

        <p style={{ fontSize: 12, color: "#475569", marginBottom: 20 }}>
          Showing <strong style={{ color: "#e2e8f0" }}>{filteredShelters.length}</strong> shelter{filteredShelters.length !== 1 ? "s" : ""}
          {selectedState !== "All" ? ` in ${selectedState}` : ""}
          {searchQuery ? ` matching "${searchQuery}"` : ""}
        </p>

        {/* Shelter Cards */}
        <div className="shelter-grid">
          {filteredShelters.map((shelter) => {
            const pct = occupancyPct(shelter);
            const avail = availableSpots(shelter);
            return (
              <div
                key={shelter.id}
                className="shelter-card"
                style={{
                  background: "#0b1329", border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 20, overflow: "hidden",
                }}
              >
                {/* Alert badge */}
                {shelter.alerts_nearby > 0 && (
                  <div style={{
                    background: "rgba(220,38,38,0.15)", borderBottom: "1px solid rgba(220,38,38,0.2)",
                    padding: "8px 16px", display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <AlertTriangle size={12} style={{ color: "#f87171" }} />
                    <span style={{ fontSize: 11, color: "#f87171", fontWeight: 700 }}>
                      {shelter.alerts_nearby} active alert{shelter.alerts_nearby > 1 ? "s" : ""} near this shelter
                    </span>
                  </div>
                )}

                <div style={{ padding: "18px" }}>
                  {/* Status & Location */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    <span style={{
                      padding: "3px 10px", borderRadius: 100, fontSize: 10, fontWeight: 800, textTransform: "uppercase",
                      background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.25)",
                    }}>
                      ✓ {shelter.status}
                    </span>
                    <span style={{ fontSize: 11, color: "#64748b" }}>{shelter.state} · {shelter.district}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#60a5fa", fontWeight: 600 }}>~{shelter.distance_km} km</span>
                  </div>

                  <h3 style={{ fontSize: 15, fontWeight: 800, color: "white", marginBottom: 5 }}>{shelter.name}</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                    <MapPin size={12} style={{ color: "#475569", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "#64748b" }}>{shelter.address}</span>
                  </div>

                  {/* Occupancy bar */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>Capacity Used</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: occupancyColor(pct) }}>
                        {avail > 0 ? `${avail.toLocaleString()} spots available` : "FULL"}
                      </span>
                    </div>
                    <div style={{ height: 7, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 4, width: `${pct}%`, background: occupancyColor(pct), transition: "width 0.5s" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: "#475569" }}>{shelter.occupied} occupied</span>
                      <span style={{ fontSize: 10, color: "#475569" }}>{shelter.capacity} total capacity</span>
                    </div>
                  </div>

                  {/* Amenities */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                    {shelter.medical_facility && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", fontSize: 10, color: "#60a5fa", fontWeight: 600 }}>
                        🏥 Medical Aid
                      </span>
                    )}
                    <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)", fontSize: 10, color: "#4ade80", fontWeight: 600 }}>
                      🍲 Food: {shelter.food_supply}
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="shelter-actions">
                    <a href={`tel:${shelter.contact}`} style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      padding: "10px", borderRadius: 12, background: "rgba(34,197,94,0.12)",
                      border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80", fontSize: 12,
                      fontWeight: 700, textDecoration: "none",
                    }}>
                      <Phone size={12} /> Call Now
                    </a>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${shelter.lat},${shelter.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="nav-btn"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        padding: "10px", borderRadius: 12, background: "rgba(59,130,246,0.1)",
                        border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa", fontSize: 12,
                        fontWeight: 700, textDecoration: "none",
                      }}
                    >
                      <Navigation size={12} /> Navigate
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredShelters.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#475569" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#94a3b8", marginBottom: 8 }}>No shelters found</div>
            <div style={{ fontSize: 13 }}>Try a different state or clear the search box</div>
            <button onClick={() => { setSearchQuery(""); setSelectedState("All"); }} style={{
              marginTop: 16, padding: "10px 20px", borderRadius: 100, background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              Show All Shelters
            </button>
          </div>
        )}

        {/* Report hazard CTA */}
        <div style={{ marginTop: 48, padding: "20px", borderRadius: 20, background: "#0a0f1d", border: "1px solid rgba(251,191,36,0.15)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "white", marginBottom: 4 }}>
                📸 Spotted a hazard near a shelter?
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                Submit a quick field report — helps rescue teams and other citizens stay safe.
              </div>
            </div>
            <Link href="/report" style={{
              display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 100,
              background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)",
              color: "#fbbf24", fontSize: 12, fontWeight: 700, textDecoration: "none",
            }}>
              Report Hazard →
            </Link>
          </div>
        </div>

        <nav className="mobile-bottom-nav">
          <Link href="/">
            <span className="icon">🏠</span>
            <span>Home</span>
          </Link>
          <Link href="/map">
            <span className="icon">🗺️</span>
            <span>Live Map</span>
          </Link>
          <Link href="/alerts">
            <span className="icon">🔔</span>
            <span>Alerts</span>
          </Link>
          <Link href="/shelter" className="active">
            <span className="icon">🏥</span>
            <span>Shelters</span>
          </Link>
          <Link href="/report">
            <span className="icon">📸</span>
            <span>Report</span>
          </Link>
        </nav>
      </main>
    </div>
  );
}
