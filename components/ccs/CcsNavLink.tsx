"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  href: string;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
  matchPrefix?: boolean;
};

export default function CcsNavLink({
  href,
  children,
  className = "ccs-nav-link text-gray-300 hover:text-primary transition-colors",
  activeClassName = "text-primary underline underline-offset-4 decoration-primary/80",
  matchPrefix = false,
}: Props) {
  const pathname = usePathname() ?? "";
  const isHash = href.startsWith("/#");
  const active = isHash
    ? false
    : matchPrefix
      ? pathname.startsWith(href)
      : pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <Link href={href} className={`${className} ${active ? activeClassName : ""}`.trim()}>
      {children}
    </Link>
  );
}
