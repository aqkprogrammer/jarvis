import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Next does not prefix basePath onto metadata URLs, so do it here — the Pages
// build serves everything under /jarvis.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "JARVIS - AI Assistant",
  description: "Your Personal AI Assistant - Just A Rather Very Intelligent System",
  keywords: ["AI", "assistant", "JARVIS", "chat", "intelligence"],
  authors: [{ name: "JARVIS System" }],
  manifest: `${basePath}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "JARVIS",
  },
  icons: {
    icon: `${basePath}/icons/icon.svg`,
    apple: `${basePath}/icons/icon.svg`,
  },
};

// Next 14: themeColor + viewport live in the viewport export
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#00d4ff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} dark`} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="dark" />
      </head>
      <body className={`${inter.className} bg-jarvis-bg text-jarvis-text antialiased`}>
        <ServiceWorkerRegistrar />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
