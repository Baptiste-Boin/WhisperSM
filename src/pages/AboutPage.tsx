import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Bug, ExternalLink, Github, Heart, RefreshCcw } from "lucide-react";
import { commands } from "@/bindings";
import { WhisperSMMark } from "@/components/icons/WhisperSMLogo";
import { Badge, Button, PageHeader, SettingsGroup } from "@/components/ui";
import { SettingContainer } from "@/components/ui/SettingContainer";
import { useSettings } from "@/hooks/useSettings";

const REPO_URL = "https://github.com/Baptiste-Boin/WhisperSM";

const CREDITS: { name: string; url: string; descriptionKey: string }[] = [
  {
    name: "Handy",
    url: "https://github.com/cjpais/Handy",
    descriptionKey: "about.credits.handy",
  },
  {
    name: "Parler",
    url: "https://github.com/Melvynx/Parler",
    descriptionKey: "about.credits.parler",
  },
  {
    name: "whisper.cpp",
    url: "https://github.com/ggml-org/whisper.cpp",
    descriptionKey: "about.credits.whisper",
  },
  {
    name: "candle",
    url: "https://github.com/huggingface/candle",
    descriptionKey: "about.credits.candle",
  },
  {
    name: "Qwen 2.5 · Llama 3.2",
    url: "https://huggingface.co/Qwen",
    descriptionKey: "about.credits.models",
  },
];

export const AboutPage: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [version, setVersion] = useState("");
  const versionLabel = version ? `v${version}` : "";
  const appName = "WhisperSM";

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(""));
  }, []);

  const checkUpdates = async () => {
    try {
      await commands.triggerUpdateCheck();
    } catch (error) {
      console.error("Failed to trigger update check:", error);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("sidebar.about")} />

      <section className="wsm-card px-6 py-6 flex items-center gap-5">
        <WhisperSMMark size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-semibold tracking-tight">{appName}</h2>
            {versionLabel && (
              <Badge variant="secondary" className="font-mono">
                {versionLabel}
              </Badge>
            )}
          </div>
          <p className="text-sm text-text-muted mt-1 leading-relaxed">
            {t("about.tagline")}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openUrl(REPO_URL)}
            >
              <Github className="w-3.5 h-3.5" />
              {t("settings.about.sourceCode.button")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openUrl(`${REPO_URL}/releases`)}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t("about.releases")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openUrl(`${REPO_URL}/issues/new/choose`)}
            >
              <Bug className="w-3.5 h-3.5" />
              {t("about.reportIssue")}
            </Button>
            <Button
              variant="primary-soft"
              size="sm"
              onClick={checkUpdates}
              disabled={!(settings?.update_checks_enabled ?? true)}
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              {t("footer.checkForUpdates")}
            </Button>
          </div>
        </div>
      </section>

      <SettingsGroup title={t("about.privacy.title")}>
        <SettingContainer
          title={t("about.privacy.localTitle")}
          description={t("about.privacy.localDescription")}
          descriptionMode="inline"
          grouped={true}
        >
          <Badge variant="success">{t("about.privacy.badge")}</Badge>
        </SettingContainer>
      </SettingsGroup>

      <SettingsGroup
        title={t("settings.about.acknowledgments.title")}
        description={t("about.credits.description")}
      >
        {CREDITS.map((credit) => (
          <button
            key={credit.name}
            type="button"
            onClick={() => openUrl(credit.url)}
            className="w-full flex items-center justify-between gap-4 px-4 py-2.5 text-start hover:bg-surface-2 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{credit.name}</p>
              <p className="text-xs text-text-muted">
                {t(credit.descriptionKey)}
              </p>
            </div>
            <ExternalLink className="w-4 h-4 text-text-muted shrink-0" />
          </button>
        ))}
      </SettingsGroup>

      <p className="text-xs text-text-muted px-1 flex items-center gap-1.5">
        <Heart className="w-3.5 h-3.5 text-danger" />
        {t("about.license")}
      </p>
    </div>
  );
};
