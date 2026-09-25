import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { platform } from "@tauri-apps/plugin-os";
import {
  requestAccessibilityPermission,
  checkMicrophonePermission,
  requestMicrophonePermission,
} from "tauri-plugin-macos-permissions-api";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cpu,
  Keyboard,
  Loader2,
  Mic,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { commands, type LocalLlmModelInfo, type ModelInfo } from "@/bindings";
import {
  checkMacOSAccessibilityReady,
  initializeMacOSAccessibilitySystems,
} from "@/lib/permissions";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSettings } from "@/hooks/useSettings";
import { useModelStore } from "@/stores/modelStore";
import { useLocalLlmStore } from "@/stores/localLlmStore";
import { useOsType } from "@/hooks/useOsType";
import { formatKeyCombination } from "@/lib/utils/keyboard";
import { formatModelSize } from "@/lib/utils/format";
import WhisperSMLogo, { WhisperSMMark } from "../icons/WhisperSMLogo";
import { Badge, Button, KeyCombo } from "@/components/ui";
import ModelCard, { type ModelCardStatus } from "./ModelCard";

type Step = "welcome" | "permissions" | "speech" | "ai" | "ready";

interface OnboardingWizardProps {
  /** "full" runs every step; "permissions" only re-checks system access. */
  mode: "full" | "permissions";
  onComplete: () => void;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

const StepDots: React.FC<{ steps: Step[]; current: Step }> = ({
  steps,
  current,
}) => {
  const index = steps.indexOf(current);
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {steps.map((step, i) => (
        <span
          key={step}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === index
              ? "w-6 wsm-gradient"
              : i < index
                ? "w-1.5 bg-accent/60"
                : "w-1.5 bg-surface-3"
          }`}
        />
      ))}
    </div>
  );
};

const Frame: React.FC<{
  steps: Step[];
  current: Step;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ steps, current, children, footer }) => (
  <div className="h-screen w-screen flex flex-col bg-background select-none">
    <div className="flex items-center justify-between px-8 pt-6">
      <WhisperSMLogo size={24} />
      <StepDots steps={steps} current={current} />
    </div>
    <div className="flex-1 overflow-y-auto">
      <div
        className="max-w-[640px] mx-auto px-8 py-8 wsm-fade-in"
        key={current}
      >
        {children}
      </div>
    </div>
    {footer && (
      <div className="border-t border-border bg-surface/60 backdrop-blur px-8 py-4">
        <div className="max-w-[640px] mx-auto flex items-center justify-between gap-3">
          {footer}
        </div>
      </div>
    )}
  </div>
);

const StepTitle: React.FC<{
  eyebrow?: string;
  title: string;
  description?: string;
}> = ({ eyebrow, title, description }) => (
  <div className="mb-6">
    {eyebrow && (
      <p className="text-xs font-semibold uppercase tracking-wide text-accent mb-1">
        {eyebrow}
      </p>
    )}
    <h1 className="text-[26px] font-semibold tracking-tight leading-tight">
      {title}
    </h1>
    {description && (
      <p className="text-sm text-text-muted mt-2 leading-relaxed">
        {description}
      </p>
    )}
  </div>
);

/* ------------------------------------------------------------------ */
/* Permissions step (macOS / Windows)                                  */
/* ------------------------------------------------------------------ */

type PermissionStatus = "checking" | "needed" | "waiting" | "granted";
type PermissionPlatform = "macos" | "windows" | "other";

interface PermissionsState {
  accessibility: PermissionStatus;
  microphone: PermissionStatus;
}

const usePermissions = (onAllGranted: () => void) => {
  const { t } = useTranslation();
  const refreshAudioDevices = useSettingsStore((s) => s.refreshAudioDevices);
  const refreshOutputDevices = useSettingsStore((s) => s.refreshOutputDevices);
  const [permissionPlatform, setPermissionPlatform] =
    useState<PermissionPlatform | null>(null);
  const [permissions, setPermissions] = useState<PermissionsState>({
    accessibility: "checking",
    microphone: "checking",
  });
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const errorCountRef = useRef(0);
  const enigoInitializedRef = useRef(false);
  const completedRef = useRef(false);
  const MAX_POLLING_ERRORS = 10;

  const isMacOS = permissionPlatform === "macos";
  const isWindows = permissionPlatform === "windows";

  const allGranted = isMacOS
    ? permissions.accessibility === "granted" &&
      permissions.microphone === "granted"
    : isWindows
      ? permissions.microphone === "granted"
      : permissionPlatform === "other";

  const complete = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    await Promise.all([refreshAudioDevices(), refreshOutputDevices()]);
    onAllGranted();
  }, [onAllGranted, refreshAudioDevices, refreshOutputDevices]);

  const hasWindowsMicrophoneAccess = useCallback(async () => {
    const status = await commands.getWindowsMicrophonePermissionStatus();
    if (!status.supported) return true;
    return status.overall_access !== "denied";
  }, []);

  const checkMac = useCallback(async () => {
    const [accessibilityGranted, microphoneGranted] = await Promise.all([
      checkMacOSAccessibilityReady().catch(() => false),
      checkMicrophonePermission().catch(() => false),
    ]);
    if (accessibilityGranted && !enigoInitializedRef.current) {
      enigoInitializedRef.current = true;
      initializeMacOSAccessibilitySystems().catch((e) => {
        enigoInitializedRef.current = false;
        console.warn("Failed to initialize after permission grant:", e);
      });
    }
    setPermissions((prev) => ({
      accessibility: accessibilityGranted
        ? "granted"
        : prev.accessibility === "waiting"
          ? "waiting"
          : "needed",
      microphone: microphoneGranted
        ? "granted"
        : prev.microphone === "waiting"
          ? "waiting"
          : "needed",
    }));
    return accessibilityGranted && microphoneGranted;
  }, []);

  useEffect(() => {
    const current = platform();
    const next: PermissionPlatform =
      current === "macos"
        ? "macos"
        : current === "windows"
          ? "windows"
          : "other";
    setPermissionPlatform(next);

    if (next === "other") {
      setPermissions({ accessibility: "granted", microphone: "granted" });
      return;
    }

    (async () => {
      try {
        if (next === "macos") {
          if (await checkMac()) await complete();
        } else {
          const granted = await hasWindowsMicrophoneAccess();
          setPermissions({
            accessibility: "granted",
            microphone: granted ? "granted" : "needed",
          });
          if (granted) await complete();
        }
      } catch (error) {
        console.error("Failed to check permissions:", error);
        toast.error(t("onboarding.permissions.errors.checkFailed"));
        setPermissions({ accessibility: "needed", microphone: "needed" });
      }
    })();
  }, [checkMac, complete, hasWindowsMicrophoneAccess, t]);

  const startPolling = useCallback(() => {
    if (pollingRef.current || permissionPlatform === null) return;
    errorCountRef.current = 0;
    pollingRef.current = setInterval(async () => {
      try {
        if (permissionPlatform === "windows") {
          if (await hasWindowsMicrophoneAccess()) {
            setPermissions((prev) => ({ ...prev, microphone: "granted" }));
            await complete();
          }
        } else if (await checkMac()) {
          await complete();
        }
        errorCountRef.current = 0;
      } catch (error) {
        console.error("Error checking permissions:", error);
        errorCountRef.current += 1;
        if (errorCountRef.current >= MAX_POLLING_ERRORS) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          setPermissions((prev) => ({
            accessibility:
              prev.accessibility === "waiting" ? "needed" : prev.accessibility,
            microphone:
              prev.microphone === "waiting" ? "needed" : prev.microphone,
          }));
          toast.error(t("onboarding.permissions.errors.checkFailed"));
        }
      }
    }, 1000);
  }, [checkMac, complete, hasWindowsMicrophoneAccess, permissionPlatform, t]);

  useEffect(
    () => () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    },
    [],
  );

  const grantAccessibility = async () => {
    try {
      await requestAccessibilityPermission();
      setPermissions((prev) => ({ ...prev, accessibility: "waiting" }));
      startPolling();
    } catch (error) {
      console.error("Failed to request accessibility permission:", error);
      toast.error(t("onboarding.permissions.errors.requestFailed"));
    }
  };

  const grantMicrophone = async () => {
    try {
      if (isWindows) {
        await commands.openMicrophonePrivacySettings();
      } else {
        await requestMicrophonePermission();
      }
      setPermissions((prev) => ({ ...prev, microphone: "waiting" }));
      startPolling();
    } catch (error) {
      console.error("Failed to request microphone permission:", error);
      toast.error(t("onboarding.permissions.errors.requestFailed"));
    }
  };

  return {
    permissionPlatform,
    permissions,
    allGranted,
    isMacOS,
    isWindows,
    grantAccessibility,
    grantMicrophone,
  };
};

const PermissionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  status: PermissionStatus;
  buttonLabel: string;
  onGrant: () => void;
}> = ({ icon, title, description, status, buttonLabel, onGrant }) => {
  const { t } = useTranslation();
  return (
    <div className="wsm-card px-4 py-4 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
          {description}
        </p>
      </div>
      <div className="shrink-0">
        {status === "granted" ? (
          <Badge variant="success">
            <Check className="w-3 h-3" />
            {t("onboarding.permissions.granted")}
          </Badge>
        ) : status === "waiting" || status === "checking" ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t("onboarding.permissions.waiting")}
          </span>
        ) : (
          <Button variant="primary" size="sm" onClick={onGrant}>
            {buttonLabel}
          </Button>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Wizard                                                              */
/* ------------------------------------------------------------------ */

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  mode,
  onComplete,
}) => {
  const { t } = useTranslation();
  const osType = useOsType();
  const { settings } = useSettings();
  const currentPlatform = useMemo(() => platform(), []);
  const needsPermissionStep =
    currentPlatform === "macos" || currentPlatform === "windows";

  const steps = useMemo<Step[]>(() => {
    if (mode === "permissions") return ["permissions", "ready"];
    const list: Step[] = ["welcome"];
    if (needsPermissionStep) list.push("permissions");
    list.push("speech", "ai", "ready");
    return list;
  }, [mode, needsPermissionStep]);

  const [step, setStep] = useState<Step>(steps[0]);
  const stepIndex = steps.indexOf(step);
  const goNext = useCallback(() => {
    const next = steps[stepIndex + 1];
    if (next) setStep(next);
    else onComplete();
  }, [steps, stepIndex, onComplete]);
  const goBack = () => {
    const prev = steps[stepIndex - 1];
    if (prev) setStep(prev);
  };

  /* --- speech models --- */
  const models = useModelStore((s) => s.models);
  const downloadModel = useModelStore((s) => s.downloadModel);
  const selectModel = useModelStore((s) => s.selectModel);
  const downloadingModels = useModelStore((s) => s.downloadingModels);
  const verifyingModels = useModelStore((s) => s.verifyingModels);
  const extractingModels = useModelStore((s) => s.extractingModels);
  const downloadProgress = useModelStore((s) => s.downloadProgress);
  const downloadStats = useModelStore((s) => s.downloadStats);
  const [selectedSpeechId, setSelectedSpeechId] = useState<string | null>(null);
  const [speechReady, setSpeechReady] = useState(false);
  const [showAllSpeech, setShowAllSpeech] = useState(false);

  useEffect(() => {
    if (!selectedSpeechId || speechReady) return;
    const model = models.find((m) => m.id === selectedSpeechId);
    const busy =
      selectedSpeechId in downloadingModels ||
      selectedSpeechId in verifyingModels ||
      selectedSpeechId in extractingModels;
    if (model?.is_downloaded && !busy) {
      selectModel(selectedSpeechId).then((ok) => {
        if (ok) {
          setSpeechReady(true);
        } else {
          toast.error(t("onboarding.errors.loadModels"));
          setSelectedSpeechId(null);
        }
      });
    }
  }, [
    selectedSpeechId,
    speechReady,
    models,
    downloadingModels,
    verifyingModels,
    extractingModels,
    selectModel,
    t,
  ]);

  const handleSpeechDownload = async (modelId: string) => {
    setSelectedSpeechId(modelId);
    const ok = await downloadModel(modelId);
    if (!ok) setSelectedSpeechId(null);
  };

  const speechStatus = (modelId: string): ModelCardStatus => {
    if (modelId in extractingModels) return "extracting";
    if (modelId in verifyingModels) return "verifying";
    if (modelId in downloadingModels) return "downloading";
    const model = models.find((m) => m.id === modelId);
    if (model?.is_downloaded) return "available";
    return "downloadable";
  };

  const anySpeechDownloaded = models.some((m) => m.is_downloaded);

  /* --- ai models --- */
  const localModels = useLocalLlmStore((s) => s.models);
  const localProgress = useLocalLlmStore((s) => s.downloadProgress);
  const localStats = useLocalLlmStore((s) => s.downloadStats);
  const downloadLocal = useLocalLlmStore((s) => s.downloadModel);
  const cancelLocal = useLocalLlmStore((s) => s.cancelDownload);
  const initializeLocal = useLocalLlmStore((s) => s.initialize);
  const [selectedAiId, setSelectedAiId] = useState<string | null>(null);

  useEffect(() => {
    initializeLocal();
  }, [initializeLocal]);

  const recommendedAi =
    localModels.find((m) => m.is_recommended) ?? localModels[0] ?? null;
  const aiDownloaded = localModels.some((m) => m.is_downloaded);
  const aiBusy =
    selectedAiId !== null && localProgress[selectedAiId] !== undefined;

  /* --- permissions --- */
  const permissionsDone = useRef(false);
  const onPermissionsGranted = useCallback(() => {
    permissionsDone.current = true;
  }, []);
  const perms = usePermissions(onPermissionsGranted);

  const transcribeBinding =
    settings?.bindings?.["transcribe"]?.current_binding ?? "";

  /* ---------------------------------------------------------------- */

  const renderWelcome = () => (
    <>
      <div className="flex flex-col items-center text-center mb-8">
        <WhisperSMMark size={96} className="drop-shadow-xl mb-6" />
        <h1 className="text-[30px] font-semibold tracking-tight">
          {t("onboarding.welcome.title")}
        </h1>
        <p className="text-sm text-text-muted mt-3 leading-relaxed max-w-md">
          {t("onboarding.welcome.description")}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            icon: <Mic className="w-5 h-5" />,
            title: t("onboarding.welcome.features.speech.title"),
            text: t("onboarding.welcome.features.speech.text"),
          },
          {
            icon: <Sparkles className="w-5 h-5" />,
            title: t("onboarding.welcome.features.ai.title"),
            text: t("onboarding.welcome.features.ai.text"),
          },
          {
            icon: <ShieldCheck className="w-5 h-5" />,
            title: t("onboarding.welcome.features.privacy.title"),
            text: t("onboarding.welcome.features.privacy.text"),
          },
        ].map((feature) => (
          <div key={feature.title} className="wsm-card px-4 py-4">
            <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center mb-3">
              {feature.icon}
            </div>
            <p className="text-sm font-semibold">{feature.title}</p>
            <p className="text-xs text-text-muted mt-1 leading-relaxed">
              {feature.text}
            </p>
          </div>
        ))}
      </div>
    </>
  );

  const renderPermissions = () => (
    <>
      <StepTitle
        eyebrow={t("onboarding.steps.permissions")}
        title={t("onboarding.permissions.title")}
        description={t("onboarding.permissions.description")}
      />
      {perms.permissionPlatform === null ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : (
        <div className="space-y-3">
          {(perms.isMacOS || perms.isWindows) && (
            <PermissionCard
              icon={<Mic className="w-5 h-5" />}
              title={t("onboarding.permissions.microphone.title")}
              description={t("onboarding.permissions.microphone.description")}
              status={perms.permissions.microphone}
              buttonLabel={
                perms.isWindows
                  ? t("accessibility.openSettings")
                  : t("onboarding.permissions.grant")
              }
              onGrant={perms.grantMicrophone}
            />
          )}
          {perms.isMacOS && (
            <PermissionCard
              icon={<Keyboard className="w-5 h-5" />}
              title={t("onboarding.permissions.accessibility.title")}
              description={t(
                "onboarding.permissions.accessibility.description",
              )}
              status={perms.permissions.accessibility}
              buttonLabel={t("onboarding.permissions.grant")}
              onGrant={perms.grantAccessibility}
            />
          )}
        </div>
      )}
    </>
  );

  const renderSpeech = () => {
    const recommended = models.filter((m) => m.is_recommended);
    const others = models
      .filter((m) => !m.is_recommended)
      .sort((a, b) => Number(a.size_mb) - Number(b.size_mb));
    const list = showAllSpeech ? [...recommended, ...others] : recommended;
    return (
      <>
        <StepTitle
          eyebrow={t("onboarding.steps.speech")}
          title={t("onboarding.speech.title")}
          description={t("onboarding.speech.description")}
        />
        <div className="flex flex-col gap-3">
          {list.map((model: ModelInfo) => (
            <ModelCard
              key={model.id}
              model={model}
              variant={model.is_recommended ? "featured" : "default"}
              status={speechStatus(model.id)}
              disabled={
                selectedSpeechId !== null && selectedSpeechId !== model.id
              }
              onSelect={(id) => {
                setSelectedSpeechId(id);
              }}
              onDownload={handleSpeechDownload}
              downloadProgress={downloadProgress[model.id]?.percentage}
              downloadSpeed={downloadStats[model.id]?.speed}
            />
          ))}
          {!showAllSpeech && others.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAllSpeech(true)}
              className="text-xs font-medium text-accent hover:underline self-center py-1"
            >
              {t("onboarding.speech.showAll", { count: others.length })}
            </button>
          )}
        </div>
      </>
    );
  };

  const renderAi = () => (
    <>
      <StepTitle
        eyebrow={t("onboarding.steps.ai")}
        title={t("onboarding.ai.title")}
        description={t("onboarding.ai.description")}
      />
      {recommendedAi && (
        <div className="wsm-card px-5 py-5 border-accent/40">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl wsm-gradient text-white flex items-center justify-center shrink-0 shadow">
              <Cpu className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold">
                  {recommendedAi.name}
                </h3>
                <Badge variant="primary">{t("onboarding.recommended")}</Badge>
                <Badge variant="secondary">{recommendedAi.parameters}</Badge>
              </div>
              <p className="text-sm text-text-muted mt-1 leading-relaxed">
                {recommendedAi.description}
              </p>
              <p className="text-xs text-text-muted mt-2">
                {t("onboarding.ai.details", {
                  size: formatModelSize(Number(recommendedAi.size_mb)),
                  ram: recommendedAi.min_ram_gb,
                })}
              </p>
            </div>
          </div>
          <div className="mt-4">
            {recommendedAi.is_downloaded ? (
              <div className="flex items-center gap-2 text-sm text-success font-medium">
                <Check className="w-4 h-4" />
                {t("onboarding.ai.ready")}
              </div>
            ) : localProgress[recommendedAi.id] !== undefined ? (
              <div className="space-y-1.5">
                <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden">
                  <div
                    className="h-full wsm-gradient rounded-full transition-[width] duration-300"
                    style={{
                      width: `${Math.max(2, localProgress[recommendedAi.id]?.percentage ?? 0)}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>
                    {t("modelSelector.downloading", {
                      percentage: Math.round(
                        localProgress[recommendedAi.id]?.percentage ?? 0,
                      ),
                    })}
                  </span>
                  <div className="flex items-center gap-2">
                    {(localStats[recommendedAi.id]?.speed ?? 0) > 0 && (
                      <span className="tabular-nums">
                        {t("modelSelector.downloadSpeed", {
                          speed: (
                            localStats[recommendedAi.id]?.speed ?? 0
                          ).toFixed(1),
                        })}
                      </span>
                    )}
                    <Button
                      variant="danger-ghost"
                      size="sm"
                      onClick={() => cancelLocal(recommendedAi.id)}
                    >
                      {t("modelSelector.cancel")}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <Button
                variant="primary"
                size="lg"
                onClick={() => {
                  setSelectedAiId(recommendedAi.id);
                  downloadLocal(recommendedAi.id);
                }}
              >
                <Sparkles className="w-4 h-4" />
                {t("onboarding.ai.download")}
              </Button>
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-text-muted mt-4 leading-relaxed">
        {t("onboarding.ai.later")}
      </p>
    </>
  );

  const renderReady = () => (
    <div className="flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-full bg-success/15 text-success flex items-center justify-center mb-6">
        <Check className="w-10 h-10" />
      </div>
      <h1 className="text-[28px] font-semibold tracking-tight">
        {t("onboarding.ready.title")}
      </h1>
      <p className="text-sm text-text-muted mt-2 leading-relaxed max-w-md">
        {settings?.push_to_talk
          ? t("onboarding.ready.descriptionHold")
          : t("onboarding.ready.descriptionToggle")}
      </p>
      {transcribeBinding && (
        <div className="mt-6">
          <KeyCombo
            combination={formatKeyCombination(transcribeBinding, osType)}
            size="lg"
          />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 w-full text-start">
        <div className="wsm-card px-4 py-3">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
            {t("onboarding.ready.tipModesTitle")}
          </p>
          <p className="text-sm mt-1 leading-relaxed">
            {t("onboarding.ready.tipModes")}
          </p>
        </div>
        <div className="wsm-card px-4 py-3">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
            {t("onboarding.ready.tipTrayTitle")}
          </p>
          <p className="text-sm mt-1 leading-relaxed">
            {t("onboarding.ready.tipTray")}
          </p>
        </div>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */

  const canContinue = (() => {
    switch (step) {
      case "permissions":
        return perms.allGranted;
      case "speech":
        return speechReady || anySpeechDownloaded;
      case "ai":
        return !aiBusy;
      default:
        return true;
    }
  })();

  const nextLabel = (() => {
    switch (step) {
      case "welcome":
        return t("onboarding.actions.getStarted");
      case "ai":
        return aiDownloaded
          ? t("onboarding.actions.continue")
          : t("onboarding.actions.skip");
      case "ready":
        return t("onboarding.actions.finish");
      default:
        return t("onboarding.actions.continue");
    }
  })();

  const footer = (
    <>
      <div>
        {stepIndex > 0 && step !== "ready" && (
          <Button variant="ghost" size="md" onClick={goBack}>
            <ArrowLeft className="w-4 h-4" />
            {t("onboarding.actions.back")}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {step === "permissions" && !perms.allGranted && (
          <Button variant="ghost" size="md" onClick={goNext}>
            {t("onboarding.permissions.skip")}
          </Button>
        )}
        <Button
          variant="primary"
          size="lg"
          onClick={goNext}
          disabled={!canContinue}
        >
          {nextLabel}
          {step !== "ready" && <ArrowRight className="w-4 h-4" />}
        </Button>
      </div>
    </>
  );

  return (
    <Frame steps={steps} current={step} footer={footer}>
      {step === "welcome" && renderWelcome()}
      {step === "permissions" && renderPermissions()}
      {step === "speech" && renderSpeech()}
      {step === "ai" && renderAi()}
      {step === "ready" && renderReady()}
    </Frame>
  );
};
