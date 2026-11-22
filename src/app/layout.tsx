import type { Metadata } from "next";
import { Manrope, Russo_One } from "next/font/google";
import "./globals.css";
import "./student-design-system.css";
import "./student-interior-pages.css";
import "./teacher-workspace-design.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["cyrillic", "latin"],
  display: "swap",
});

const russoOne = Russo_One({
  variable: "--font-russo-one",
  weight: "400",
  subsets: ["cyrillic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Digital Campus — кабинет студента",
  description: "Демонстрационный интерфейс студенческого кабинета Digital Campus.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${manrope.variable} ${russoOne.variable}`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
