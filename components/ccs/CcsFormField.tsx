import { type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

type LabelProps = {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: ReactNode;
  error?: string;
};

export function CcsFormField({ label, htmlFor, optional, children, error }: LabelProps) {
  return (
    <div className="text-left mb-4">
      <label htmlFor={htmlFor} className="block text-sm text-neutral-400 mb-1">
        {label}
        {optional && <span className="text-neutral-500"> (optional)</span>}
      </label>
      {children}
      {error && <p className="text-red-400 text-sm mt-1">{error}</p>}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-accent/50";

export function CcsInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClass} ${props.className ?? ""}`} {...props} />;
}

export function CcsTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputClass} min-h-[120px] ${props.className ?? ""}`} {...props} />;
}
