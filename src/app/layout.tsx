import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const siteUrl = 'https://selfimprove-iota.vercel.app'

export const metadata: Metadata = {
  title: { default: 'SelfImprove — AI Product Manager for Developers', template: '%s | SelfImprove' },
  description: 'SelfImprove watches your users, builds your roadmap, and ships the fixes. AI-powered product management for indie devs and solo SaaS founders.',
  authors: [{ name: 'SelfImprove' }],
  robots: 'index, follow',
  metadataBase: new URL(siteUrl),
  alternates: { canonical: siteUrl },
  openGraph: {
    title: 'SelfImprove — AI Product Manager for Developers',
    description: 'You built your v1. Now make it actually work. Watch your users, build your roadmap, ship the fixes—all with AI.',
    url: siteUrl,
    siteName: 'SelfImprove',
    locale: 'en_US',
    type: 'website',
    images: [{
      url: `${siteUrl}/og-image.png`,
      width: 1200,
      height: 630,
      type: 'image/png',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SelfImprove — AI Product Manager for Developers',
    description: 'You built your v1. Now make it actually work. AI-powered user analytics, roadmap generation, and fix shipping for indie devs.',
    images: [{
      url: `${siteUrl}/og-image.png`,
      alt: 'SelfImprove: You built your v1. Now make it actually work.',
    }],
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SelfImprove',
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
        <script
          src="https://selfimprove-iota.vercel.app/widget.js"
          data-project="bb7ec56a-5ef9-4bc1-af84-b206af76e039"
          async
        />
      </body>
    </html>
  );
}
