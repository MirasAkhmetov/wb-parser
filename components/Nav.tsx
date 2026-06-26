"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Парсер продавца" },
  { href: "/complaints", label: "Обращения правообладателя" },
  { href: "/search", label: "Поиск ИП / ТОО" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-4 py-3">
        <span className="mr-4 text-sm font-bold text-wb-purple">WB Parser</span>
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                active
                  ? "bg-wb-purple text-white"
                  : "text-gray-600 hover:bg-wb-light hover:text-wb-purple"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
