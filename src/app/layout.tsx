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

export const metadata: Metadata = {
  title: { default: 'SelfImprove — AI Product Manager for Developers', template: '%s | SelfImprove' },
  description: 'SelfImprove watches your users, builds your roadmap, and ships the fixes. The AI product manager for developers.',
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
