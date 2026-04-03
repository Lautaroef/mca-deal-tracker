import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TRPCProvider } from "@/lib/trpc";
import { Toaster } from "sonner";
import { DevToolbar } from "@/components/dev-toolbar";
import { AppHeader } from "@/components/app-header";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MCA Pilot",
  description: "Multi-tenant deal tracker for merchant cash advance brokers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TRPCProvider>
          <TooltipProvider>
            <AppHeader />
            <div className="pt-14">{children}</div>
            <Toaster />
            <DevToolbar />
          </TooltipProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
