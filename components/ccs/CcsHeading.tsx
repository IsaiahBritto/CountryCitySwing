import { type ReactNode } from "react";

type Level = 1 | 2 | 3;

const levelClass: Record<Level, string> = {
  1: "ccs-page-title",
  2: "ccs-section-title",
  3: "text-xl font-bold text-primary",
};

type Props = {
  level?: Level;
  variant?: "default" | "display" | "goldWave";
  className?: string;
  children: ReactNode;
};

export default function CcsHeading({
  level = 2,
  variant = "default",
  className = "",
  children,
}: Props) {
  const Tag = ({ 1: "h1", 2: "h2", 3: "h3" } as const)[level];

  let styleClass = levelClass[level];
  if (variant === "display") {
    styleClass = "ccs-display font-display";
  } else if (variant === "goldWave") {
    styleClass = `${levelClass[level]} ccs-text-gold-wave gold-wave pb-2`;
  } else {
    styleClass = `${styleClass} text-primary`;
  }

  return <Tag className={`${styleClass} ${className}`.trim()}>{children}</Tag>;
}
