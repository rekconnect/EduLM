import * as React from "react";

const base =
  "block w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm outline-none transition placeholder:text-[color:var(--muted-fg)] focus:border-[color:var(--primary)] disabled:cursor-not-allowed disabled:opacity-50";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = "", ...props }, ref) {
  return <input ref={ref} {...props} className={`${base} ${className}`} />;
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", ...props }, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={`${base} min-h-[80px] ${className}`}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = "", children, ...props }, ref) {
  return (
    <select ref={ref} {...props} className={`${base} h-10 ${className}`}>
      {children}
    </select>
  );
});
