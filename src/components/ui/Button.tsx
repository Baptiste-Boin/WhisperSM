import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "primary-soft"
    | "secondary"
    | "danger"
    | "danger-ghost"
    | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className = "",
  variant = "primary",
  size = "md",
  ...props
}) => {
  const baseClasses =
    "inline-flex items-center justify-center gap-1.5 font-medium rounded-lg border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0 cursor-pointer select-none";

  const variantClasses = {
    primary:
      "text-on-accent bg-accent border-accent hover:bg-accent/90 hover:border-accent/90 shadow-[0_1px_2px_rgba(0,0,0,0.12)]",
    "primary-soft":
      "text-accent bg-accent-soft border-transparent hover:bg-accent/20",
    secondary:
      "text-text bg-surface border-border-strong hover:bg-surface-2 hover:border-accent/50",
    danger:
      "text-white bg-danger border-danger hover:bg-danger/90 hover:border-danger/90",
    "danger-ghost":
      "text-danger border-transparent hover:bg-danger/10 focus:bg-danger/15",
    ghost: "text-text/80 border-transparent hover:bg-surface-2 hover:text-text",
  };

  const sizeClasses = {
    sm: "px-2.5 h-7 text-xs",
    md: "px-3.5 h-8 text-sm",
    lg: "px-5 h-10 text-sm",
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
