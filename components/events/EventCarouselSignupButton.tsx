"use client";

import type { CSSProperties, ReactNode } from "react";
import type { EventCarouselTheme } from "@/lib/design/eventCarouselTheme";
import { eventCarouselSignupStyleVars } from "@/lib/design/eventCarouselTheme";

type Props = {
  theme: EventCarouselTheme;
  children: ReactNode;
  className?: string;
} & (
  | {
      as: "button";
      onClick: () => void;
      disabled?: boolean;
      href?: undefined;
    }
  | {
      as: "link";
      href: string;
      onClick?: undefined;
      disabled?: undefined;
    }
);

export default function EventCarouselSignupButton({
  theme,
  children,
  className = "",
  ...rest
}: Props) {
  const { signup } = theme;
  const style = {
    ...eventCarouselSignupStyleVars(theme),
    backgroundColor: signup.background,
    color: signup.color,
    borderColor: signup.borderColor,
    boxShadow: signup.shadow,
  } as CSSProperties;
  const classes = `event-carousel-signup-btn ${className}`.trim();

  if (rest.as === "link") {
    return (
      <a
        href={rest.href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
        style={style}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      style={style}
      onClick={rest.onClick}
      disabled={rest.disabled}
    >
      {children}
    </button>
  );
}
