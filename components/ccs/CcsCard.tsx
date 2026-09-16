import { type ReactNode } from "react";

type Props = {
  glow?: "gold" | "none";
  className?: string;
  children: ReactNode;
};

export default function CcsCard({ glow = "none", className = "", children }: Props) {
  const glowClass = glow === "gold" ? "ccs-card--glow-gold" : "";
  return <div className={`ccs-card ${glowClass} ${className}`.trim()}>{children}</div>;
}
