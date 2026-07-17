import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/components/providers/ToastProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const siteUrl = 'https://shipsitself.com'

export const metadata: Metadata = {
  title: { default: 'Ships Itself — AI Product Manager for Developers', template: '%s | Ships Itself' },
  description: 'Ships Itself watches your users, builds your roadmap, and ships the fixes. AI-powered product management for indie devs and solo SaaS founders.',
  authors: [{ name: 'Ships Itself' }],
  robots: 'index, follow',
  metadataBase: new URL(siteUrl),
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Ships Itself — AI Product Manager for Developers',
    description: 'You built your v1. Now make it actually work. Watch your users, build your roadmap, ship the fixes—all with AI.',
    url: siteUrl,
    siteName: 'Ships Itself',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ships Itself — AI Product Manager for Developers',
    description: 'You built your v1. Now make it actually work. AI-powered user analytics, roadmap generation, and fix shipping for indie devs.',
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Ships Itself',
  },
  other: {
    'theme-color': '#0d9488',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--bg)]">
        {children}
        <ToastProvider />
        <script
          src={`${siteUrl}/widget.js`}
          data-project="bb7ec56a-5ef9-4bc1-af84-b206af76e039"
          async
        />
      </body>
    </html>
  );
}
