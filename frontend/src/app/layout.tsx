import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

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

export const metadata: Metadata = {
  title: "JARVIS - AI Assistant",
  description: "Your Personal AI Assistant - Just A Rather Very Intelligent System",
  keywords: ["AI", "assistant", "JARVIS", "chat", "intelligence"],
  authors: [{ name: "JARVIS System" }],
  themeColor: "#050A0F",
  viewport: "width=device-width, initial-scale=1",
  icons: {
    icon: "/favicon.ico",
  },
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
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
