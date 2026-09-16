import Link from "next/link";
import { type ButtonHTMLAttributes, type ReactNode } from "react";

const variantClass = {
  solidGold: "ccs-btn ccs-btn--solid-gold",
  solidPink: "ccs-btn ccs-btn--solid-pink",
  ghostGold: "ccs-btn ccs-btn--ghost-gold",
  ghostBrand: "ccs-btn ccs-btn--ghost-brand",
  signIn: "ccs-btn ccs-btn--sign-in",
  primary: "btn btn-primary",
  accent: "btn btn-accent",
  signup: "btn-signup",
} as const;

export type CcsButtonVariant = keyof typeof variantClass;

type BaseProps = {
  variant?: CcsButtonVariant;
  className?: string;
  children: ReactNode;
};

type AsButton = BaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

type AsLink = BaseProps & {
  href: string;
  onClick?: () => void;
};

export default function CcsButton(props: AsButton | AsLink) {
  const { variant = "solidGold", className = "", children } = props;
  const classes = `${variantClass[variant]} ${className}`.trim();

  if ("href" in props && props.href) {
    return (
      <Link href={props.href} className={classes} onClick={props.onClick}>
        {children}
      </Link>
    );
  }

  const { type = "button", ...rest } = props as AsButton;
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
