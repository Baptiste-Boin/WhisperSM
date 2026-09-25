import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "compact";
}

export const Input: React.FC<InputProps> = ({
  className = "",
  variant = "default",
  disabled,
  ...props
}) => {
  const baseClasses =
    "text-sm font-medium bg-surface border border-border-strong rounded-lg text-start text-text placeholder:text-text-muted/70 transition-[background-color,border-color,box-shadow] duration-150";

  const interactiveClasses = disabled
    ? "opacity-60 cursor-not-allowed"
    : "hover:border-accent/50 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

  const variantClasses = {
    default: "px-3 h-9",
    compact: "px-2.5 h-8",
  } as const;

  return (
    <input
      className={`${baseClasses} ${variantClasses[variant]} ${interactiveClasses} ${className}`}
      disabled={disabled}
      {...props}
    />
  );
};
