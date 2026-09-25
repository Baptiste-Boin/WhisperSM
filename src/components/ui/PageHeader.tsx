import React from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Standard page header: large title, optional description and actions.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  children,
}) => (
  <div className="flex flex-col gap-3">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight leading-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-text-muted mt-1 leading-relaxed max-w-xl">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
    {children}
  </div>
);
