import Nav from "@/components/Nav";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WB Parser — Парсер Wildberries",
  description: "Парсер товаров продавца Wildberries с экспортом в Excel",
  applicationName: "WB Parser",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-gray-50 antialiased">
        <Nav />
        {children}
      </body>
    </html>
  );
}
