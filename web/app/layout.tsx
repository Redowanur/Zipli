import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Backdrop } from "@/components/Backdrop";
import { Nav } from "@/components/Nav";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Zipli — fast short links with real analytics",
  description: "Create short links that redirect instantly and see every click: referrers, devices and countries.",
  icons: { icon: "/favicon.svg" },
};
export const viewport: Viewport = { themeColor: "#07070d" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <Providers>
          <Backdrop />
          <Nav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
