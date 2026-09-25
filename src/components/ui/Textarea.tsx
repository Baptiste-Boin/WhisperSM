import React from "react";

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: "default" | "compact";
}

export const Textarea: React.FC<TextareaProps> = ({
  className = "",
  variant = "default",
  ...props
}) => {
  const baseClasses =
    "text-sm bg-surface border border-border-strong rounded-lg text-start text-text placeholder:text-text-muted/70 transition-[background-color,border-color,box-shadow] duration-150 hover:border-accent/50 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 resize-y leading-relaxed";

  const variantClasses = {
    default: "px-3 py-2 min-h-[100px]",
    compact: "px-2.5 py-1.5 min-h-[80px]",
  };

  return (
    <textarea
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
};
