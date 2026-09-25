import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "primary" | "success" | "secondary" | "warning" | "outline";
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "primary",
  className = "",
}) => {
  const variantClasses = {
    primary: "bg-accent-soft text-accent",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    secondary: "bg-surface-3 text-text/70",
    outline: "border border-border-strong text-text-muted",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 h-5 rounded-full text-[11px] font-semibold leading-none whitespace-nowrap ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

export default Badge;
