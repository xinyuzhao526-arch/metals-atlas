"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const metals = [
  { symbol: "Cu", label: "铜", href: "/copper" },
  { symbol: "Li", label: "锂", href: "/lithium" },
  { symbol: "Ni", label: "镍", href: "/nickel" },
];

export function MetalSwitcher() {
  const pathname = usePathname();
  return (
    <nav className="metal-switcher" aria-label="选择金属">
      <span className="metal-switcher-label">金属</span>
      {metals.map((metal) => {
        const active = pathname === metal.href || pathname.startsWith(`${metal.href}/`);
        return <Link key={metal.symbol} href={metal.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><b>{metal.symbol}</b><span>{metal.label}</span></Link>;
      })}
    </nav>
  );
}
