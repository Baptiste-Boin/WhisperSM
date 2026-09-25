import React from "react";

interface SettingsGroupProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  /** Optional element rendered at the end of the header row. */
  action?: React.ReactNode;
  id?: string;
}

export const SettingsGroup: React.FC<SettingsGroupProps> = ({
  title,
  description,
  children,
  action,
  id,
}) => {
  return (
    <section className="space-y-2" id={id}>
      {(title || action) && (
        <div className="px-1 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[13px] font-semibold text-text tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
                {description}
              </p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="wsm-card overflow-visible">
        <div className="divide-y divide-border">{children}</div>
      </div>
    </section>
  );
};
