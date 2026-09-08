import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import QueryProvider from "@/components/providers/QueryProvider";
import ServiceWorkerRegistrar from "@/components/providers/ServiceWorkerRegistrar";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: {
    default: "LandGuardNER — AI Landslide Early Warning System",
    template: "%s | LandGuardNER",
  },
  description:
    "Real-time AI-powered landslide risk monitoring and early warning system for India's North Eastern Region. 24–72 hour advance predictions, SMS alerts, offline maps, multilingual alerts.",
  keywords: [
    "landslide early warning", "NER India", "disaster management",
    "AI risk monitoring", "Assam", "Meghalaya", "Manipur", "SMS alert",
    "MDoNER", "SIH 2026", "NDRF", "SDRF",
  ],
  authors: [{ name: "LandGuard NER Team" }],
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "LandGuardNER" },
  openGraph: {
    title: "LandGuardNER — AI Landslide Early Warning System",
    description: "Real-time AI-powered landslide risk monitoring for North East India",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
      </head>
      <body className={`${geist.variable} ${geistMono.variable} antialiased`}
        style={{ background: "#000000", color: "#ffffff", minHeight: "100vh" }}>
        <QueryProvider>
          <ServiceWorkerRegistrar />
          {children}
          <Toaster
            position="top-right"
            theme="dark"
            toastOptions={{
              style: { background: "#111", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" },
              classNames: {
                error: "!border-white/20 !bg-black",
                success: "!border-white/20 !bg-black",
              },
            }}
          />
        </QueryProvider>
      </body>
    </html>
  );
}
