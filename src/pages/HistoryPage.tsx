import React from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react";
import { commands } from "@/bindings";
import { Button, PageHeader } from "@/components/ui";
import { HistorySettings } from "@/components/settings/history/HistorySettings";

export const HistoryPage: React.FC = () => {
  const { t } = useTranslation();

  const openRecordingsFolder = async () => {
    try {
      const result = await commands.openRecordingsFolder();
      if (result.status !== "ok") throw new Error(String(result.error));
    } catch (error) {
      console.error("Failed to open recordings folder:", error);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("settings.history.title")}
        description={t("history.description")}
        actions={
          <Button variant="secondary" size="md" onClick={openRecordingsFolder}>
            <FolderOpen className="w-4 h-4" />
            {t("settings.history.openFolder")}
          </Button>
        }
      />
      <HistorySettings embedded />
    </div>
  );
};
