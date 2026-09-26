import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
import { Sidebar } from "./components/Sidebar";
import { HeaderBar } from "./components/HeaderBar";
import { HomePage } from "./pages/HomePage";
import { useSettings } from "./hooks/useSettings";
import { useSettingsStore } from "./stores/settingsStore";
import { useLocalLlmStore } from "./stores/localLlmStore";
import { commands } from "@/bindings";
import { checkMacOSAccessibilityReady } from "@/lib/permissions";
import { getLanguageDirection, initializeRTL } from "@/lib/utils/rtl";
import { applyTheme } from "@/lib/theme";
import { resolveSection, type AppSection } from "@/lib/navigation";

type OnboardingMode = "full" | "permissions" | "done";

interface PostProcessErrorEvent {
  provider: string;
  model: string;
  error: string;
}

interface ActiveModeEvent {
  id: string;
  name: string;
  icon: string;
}

// Home is eager since it is shown on launch; the rest load on demand.
const ModesPage = lazy(() =>
  import("./pages/ModesPage").then((m) => ({ default: m.ModesPage })),
);
const VocabularyPage = lazy(() =>
  import("./pages/VocabularyPage").then((m) => ({
    default: m.VocabularyPage,
  })),
);
const ConfigurationPage = lazy(() =>
  import("./pages/ConfigurationPage").then((m) => ({
    default: m.ConfigurationPage,
  })),
);
const AdvancedSettingsPage = lazy(() =>
  import("./pages/AdvancedSettingsPage").then((m) => ({
    default: m.AdvancedSettingsPage,
  })),
);
const SoundPage = lazy(() =>
  import("./pages/SoundPage").then((m) => ({ default: m.SoundPage })),
);
const ModelsLibraryPage = lazy(() =>
  import("./pages/ModelsLibraryPage").then((m) => ({
    default: m.ModelsLibraryPage,
  })),
);
const HistoryPage = lazy(() =>
  import("./pages/HistoryPage").then((m) => ({ default: m.HistoryPage })),
);
const AboutPage = lazy(() =>
  import("./pages/AboutPage").then((m) => ({ default: m.AboutPage })),
);
const DebugSettings = lazy(() =>
  import("./components/settings/debug/DebugSettings").then((m) => ({
    default: m.DebugSettings,
  })),
);

const SECTION_COMPONENTS: Record<AppSection, React.ComponentType> = {
  home: HomePage,
  modes: ModesPage,
  vocabulary: VocabularyPage,
  configuration: ConfigurationPage,
  advanced: AdvancedSettingsPage,
  sound: SoundPage,
  library: ModelsLibraryPage,
  history: HistoryPage,
  about: AboutPage,
  debug: DebugSettings,
};

/** Pages that manage their own width (tables, lists). */
const WIDE_SECTIONS = new Set<AppSection>(["library", "history"]);

const SIDEBAR_STORAGE_KEY = "wsm.sidebarOpen";

const readSidebarPreference = (): boolean => {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "closed";
  } catch {
    return true;
  }
};

function App() {
  const { t, i18n } = useTranslation();
  const [onboardingMode, setOnboardingMode] = useState<OnboardingMode | null>(
    null,
  );
  const [currentSection, setCurrentSection] = useState<AppSection>("home");
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    readSidebarPreference,
  );
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

  // Theme preference → data-theme attribute
  useEffect(() => {
    applyTheme(settings?.theme);
  }, [settings?.theme]);

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

  // Active mode changed from the "Change mode" shortcut
  useEffect(() => {
    const refreshSettings = useSettingsStore.getState().refreshSettings;
    const unlisten = listen<ActiveModeEvent>("active-mode-changed", (event) => {
      refreshSettings();
      toast(t("shell.modeChanged", { name: event.payload.name }), {
        id: "active-mode",
        duration: 1600,
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => {
      const next = !open;
      try {
        window.localStorage.setItem(
          SIDEBAR_STORAGE_KEY,
          next ? "open" : "closed",
        );
      } catch {
        // localStorage may be unavailable; the preference is not essential
      }
      return next;
    });
  }, []);

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

  const ActiveComponent = SECTION_COMPONENTS[currentSection] ?? HomePage;
  const isWide = WIDE_SECTIONS.has(currentSection);

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
      {sidebarOpen && (
        <Sidebar
          activeSection={currentSection}
          onSectionChange={setCurrentSection}
        />
      )}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <HeaderBar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
          onBack={
            currentSection === "advanced"
              ? () => setCurrentSection("configuration")
              : undefined
          }
        />
        <div className="flex-1 overflow-y-auto">
          <div
            className={`mx-auto px-7 py-6 flex flex-col gap-6 ${
              isWide ? "max-w-[980px]" : "max-w-[820px]"
            }`}
          >
            <AccessibilityPermissions />
            <Suspense fallback={null}>
              <div key={currentSection} className="wsm-fade-in">
                <ActiveComponent />
              </div>
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
