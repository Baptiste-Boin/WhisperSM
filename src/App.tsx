import { Suspense, useEffect, useState, useRef } from "react";
import { toast, Toaster } from "sonner";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { platform } from "@tauri-apps/plugin-os";
import { getIdentifier } from "@tauri-apps/api/app";
import { checkMicrophonePermission } from "tauri-plugin-macos-permissions-api";
import { ModelStateEvent, RecordingErrorEvent } from "./lib/types/events";
import "./App.css";
import AccessibilityPermissions from "./components/AccessibilityPermissions";
import { OnboardingWizard } from "./components/onboarding";
import {
  Sidebar,
  SidebarSection,
  SECTIONS_CONFIG,
  LEGACY_SECTION_ALIASES,
} from "./components/Sidebar";
import { useSettings } from "./hooks/useSettings";
import { useSettingsStore } from "./stores/settingsStore";
import { useLocalLlmStore } from "./stores/localLlmStore";
import { commands } from "@/bindings";
import { checkMacOSAccessibilityReady } from "@/lib/permissions";
import { getLanguageDirection, initializeRTL } from "@/lib/utils/rtl";

type OnboardingMode = "full" | "permissions" | "done";

interface PostProcessErrorEvent {
  provider: string;
  model: string;
  error: string;
}

const renderSection = (section: SidebarSection) => {
  const ActiveComponent =
    SECTIONS_CONFIG[section]?.component || SECTIONS_CONFIG.home.component;
  return (
    <Suspense fallback={null}>
      <div key={section} className="wsm-fade-in">
        <ActiveComponent />
      </div>
    </Suspense>
  );
};

const resolveSection = (section: string): SidebarSection | null => {
  if (section in SECTIONS_CONFIG) return section as SidebarSection;
  return LEGACY_SECTION_ALIASES[section] ?? null;
};

function App() {
  const { t, i18n } = useTranslation();
  const [onboardingMode, setOnboardingMode] = useState<OnboardingMode | null>(
    null,
  );
  const [currentSection, setCurrentSection] = useState<SidebarSection>("home");
  const { settings, updateSetting } = useSettings();
  const direction = getLanguageDirection(i18n.language);
  const refreshAudioDevices = useSettingsStore(
    (state) => state.refreshAudioDevices,
  );
  const refreshOutputDevices = useSettingsStore(
    (state) => state.refreshOutputDevices,
  );
  const initializeLocalLlm = useLocalLlmStore((state) => state.initialize);
  const hasCompletedPostOnboardingInit = useRef(false);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  useEffect(() => {
    initializeRTL(i18n.language);
  }, [i18n.language]);

  useEffect(() => {
    initializeLocalLlm();
  }, [initializeLocalLlm]);

  // Initialize Enigo, shortcuts, and refresh audio devices when main app loads
  useEffect(() => {
    if (onboardingMode === "done" && !hasCompletedPostOnboardingInit.current) {
      hasCompletedPostOnboardingInit.current = true;
      Promise.all([
        commands.initializeEnigo(),
        commands.initializeShortcuts(),
      ]).catch((e) => {
        console.warn("Failed to initialize:", e);
      });
      refreshAudioDevices();
      refreshOutputDevices();
    }
  }, [onboardingMode, refreshAudioDevices, refreshOutputDevices]);

  // Debug mode toggle: Ctrl/Cmd + Shift + D
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isDebugShortcut =
        event.shiftKey &&
        event.key.toLowerCase() === "d" &&
        (event.ctrlKey || event.metaKey);
      if (isDebugShortcut) {
        event.preventDefault();
        updateSetting("debug_mode", !(settings?.debug_mode ?? false));
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [settings?.debug_mode, updateSetting]);

  // Let backend shortcuts (and pages) open a specific section.
  useEffect(() => {
    const unlisten = listen<string>("navigate-to-section", (event) => {
      const section = resolveSection(event.payload);
      if (section) setCurrentSection(section);
    });
    const handleLocalNavigate = (event: Event) => {
      const section = resolveSection(
        (event as CustomEvent<string>).detail ?? "",
      );
      if (section) setCurrentSection(section);
    };
    window.addEventListener("wsm:navigate", handleLocalNavigate);
    return () => {
      unlisten.then((fn) => fn());
      window.removeEventListener("wsm:navigate", handleLocalNavigate);
    };
  }, []);

  // Recording errors
  useEffect(() => {
    const unlisten = listen<RecordingErrorEvent>("recording-error", (event) => {
      const { error_type, detail } = event.payload;
      if (error_type === "microphone_permission_denied") {
        const currentPlatform = platform();
        const platformKey = `errors.micPermissionDenied.${currentPlatform}`;
        const description = t(platformKey, {
          defaultValue: t("errors.micPermissionDenied.generic"),
        });
        toast.error(t("errors.micPermissionDeniedTitle"), { description });
      } else if (error_type === "no_input_device") {
        toast.error(t("errors.noInputDeviceTitle"), {
          description: t("errors.noInputDevice"),
        });
      } else {
        toast.error(
          t("errors.recordingFailed", { error: detail ?? "Unknown error" }),
        );
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Speech model load failures
  useEffect(() => {
    const unlisten = listen<ModelStateEvent>("model-state-changed", (event) => {
      if (event.payload.event_type === "loading_failed") {
        toast.error(
          t("errors.modelLoadFailed", {
            model:
              event.payload.model_name || t("errors.modelLoadFailedUnknown"),
          }),
          { description: event.payload.error },
        );
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Post-processing failures (cloud or on-device)
  useEffect(() => {
    const unlisten = listen<PostProcessErrorEvent>(
      "post-process-error",
      (event) => {
        toast.error(t("errors.postProcessFailed"), {
          description: event.payload.error,
        });
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  const revealMainWindowForPermissions = async () => {
    try {
      await commands.showMainWindowCommand();
    } catch (e) {
      console.warn("Failed to show main window for permission onboarding:", e);
    }
  };

  const checkOnboardingStatus = async () => {
    try {
      const appIdentifier = await getIdentifier();
      const isDevFlavor = appIdentifier.endsWith(".dev");

      const result = await commands.hasAnyModelsAvailable();
      const hasModels = result.status === "ok" && result.data;
      const currentPlatform = platform();

      if (hasModels) {
        // Returning user: only re-run the permissions step when needed.
        if (currentPlatform === "macos") {
          try {
            const [hasAccessibility, hasMicrophone] = await Promise.all([
              checkMacOSAccessibilityReady(),
              checkMicrophonePermission(),
            ]);
            if (!hasAccessibility || !hasMicrophone) {
              await revealMainWindowForPermissions();
              setOnboardingMode("permissions");
              return;
            }
          } catch (e) {
            console.warn("Failed to check macOS permissions:", e);
          }
        }

        if (currentPlatform === "windows") {
          try {
            const microphoneStatus =
              await commands.getWindowsMicrophonePermissionStatus();
            if (
              microphoneStatus.supported &&
              microphoneStatus.overall_access === "denied"
            ) {
              await revealMainWindowForPermissions();
              setOnboardingMode("permissions");
              return;
            }
          } catch (e) {
            console.warn("Failed to check Windows microphone permissions:", e);
          }
        }

        setOnboardingMode("done");
      } else {
        // New user: dev flavor cannot be granted permissions, skip that step.
        setOnboardingMode(isDevFlavor ? "full" : "full");
      }
    } catch (error) {
      console.error("Failed to check onboarding status:", error);
      setOnboardingMode("full");
    }
  };

  if (onboardingMode === null) {
    return null;
  }

  if (onboardingMode !== "done") {
    return (
      <>
        <Toaster theme="system" position="bottom-center" richColors />
        <OnboardingWizard
          mode={onboardingMode}
          onComplete={() => setOnboardingMode("done")}
        />
      </>
    );
  }

  return (
    <div
      dir={direction}
      className="h-screen flex select-none cursor-default bg-background"
    >
      <Toaster
        theme="system"
        position="bottom-center"
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              "wsm-card px-4 py-3 flex items-center gap-3 text-sm min-w-[320px]",
            title: "font-medium",
            description: "text-text-muted",
          },
        }}
      />
      <Sidebar
        activeSection={currentSection}
        onSectionChange={setCurrentSection}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[820px] mx-auto px-8 py-8 flex flex-col gap-6">
            <AccessibilityPermissions />
            {renderSection(currentSection)}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
