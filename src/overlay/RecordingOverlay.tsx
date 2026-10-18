import { listen } from "@tauri-apps/api/event";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./RecordingOverlay.css";
import { commands } from "@/bindings";
import i18n, { syncLanguageFromSettings } from "@/i18n";
import { getLanguageDirection } from "@/lib/utils/rtl";
import {
  FILLED_ACTION_ICONS,
  getActionIcon,
} from "@/lib/constants/actionIcons";
import { formatKeyCombination } from "@/lib/utils/keyboard";
import { useOsType } from "@/hooks/useOsType";
import { keyLabel } from "@/components/ui/Kbd";

type OverlayState =
  | "recording"
  | "transcribing"
  | "processing"
  | "idle"
  | "mode";
type OverlayStyle = "classic" | "mini";

interface ShowOverlayPayload {
  state: OverlayState;
  style: OverlayStyle;
  mode_name: string | null;
  mode_icon?: string | null;
  stop_shortcut?: string | null;
  cancel_shortcut?: string | null;
}

/** Number of bars in the classic window's scrolling waveform. */
const WAVE_BARS = 72;

interface ActionInfo {
  key: number | null;
  name: string;
  icon?: string;
}

const MicIcon: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="rgba(255,255,255,0.8)"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
);

const ActionIcon: React.FC<{ icon?: string }> = ({ icon }) => {
  const Icon = getActionIcon(icon);
  return (
    <Icon
      width={14}
      height={14}
      strokeWidth={2}
      stroke="rgba(255,255,255,0.85)"
    />
  );
};

const DotsIcon: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="rgba(255,255,255,0.7)"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const XIcon: React.FC = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="rgba(255,255,255,0.5)"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" x2="6" y1="6" y2="18" />
    <line x1="6" x2="18" y1="6" y2="18" />
  </svg>
);

const PauseIcon: React.FC = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="rgba(255,255,255,0.6)"
    stroke="none"
  >
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

const PlayIcon: React.FC = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="rgba(255,255,255,0.6)"
    stroke="none"
  >
    <polygon points="6,4 20,12 6,20" />
  </svg>
);

const formatTime = (s: number) => {
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
};

const TimerDisplay: React.FC<{ startTime: number; isPaused: boolean }> = ({
  startTime,
  isPaused,
}) => {
  const [display, setDisplay] = useState("0:00");
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (isPaused) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setDisplay(formatTime(elapsed));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [startTime, isPaused]);

  return <div className="timer-text">{display}</div>;
};

const AudioBars: React.FC = () => {
  const barsRef = useRef<HTMLDivElement>(null);
  const smoothedRef = useRef<number[]>(Array(16).fill(0));

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await listen<number[]>("mic-level", (event) => {
        const newLevels = event.payload;
        const smoothed = smoothedRef.current.map((prev, i) => {
          const target = newLevels[i] || 0;
          return prev * 0.65 + target * 0.35;
        });
        smoothedRef.current = smoothed;

        if (barsRef.current) {
          const bars = barsRef.current.children;
          for (let i = 0; i < bars.length; i++) {
            const v = smoothed[i] || 0;
            const el = bars[i] as HTMLElement;
            el.style.height = `${Math.min(20, 3 + Math.pow(v, 0.6) * 17)}px`;
            el.style.opacity = `${Math.max(0.25, v * 1.4)}`;
          }
        }
      });
    };
    setup();
    return () => {
      unlisten?.();
    };
  }, []);

  return (
    <div className="bars-container" ref={barsRef}>
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="bar" />
      ))}
    </div>
  );
};

/**
 * Scrolling waveform of the classic window: each mic level frame pushes one
 * bar on the right; silent bars are drawn as dots.
 */
const Waveform: React.FC<{ active: boolean }> = ({ active }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<number[]>(Array(WAVE_BARS).fill(0));

  useEffect(() => {
    if (!active) return;
    let unlisten: (() => void) | null = null;
    let smoothed = 0;
    const render = () => {
      const el = containerRef.current;
      if (!el) return;
      const bars = el.children;
      const history = historyRef.current;
      for (let i = 0; i < bars.length; i++) {
        const v = history[i] ?? 0;
        const bar = bars[i] as HTMLElement;
        bar.style.height = `${Math.max(2, Math.min(56, 2 + Math.pow(v, 0.7) * 54))}px`;
        bar.style.opacity = v < 0.04 ? "0.45" : `${0.6 + Math.min(0.4, v)}`;
      }
    };
    const setup = async () => {
      unlisten = await listen<number[]>("mic-level", (event) => {
        const levels = event.payload;
        const peak = levels.length ? Math.max(...levels) : 0;
        smoothed = smoothed * 0.4 + peak * 0.6;
        const history = historyRef.current;
        history.shift();
        history.push(Math.min(1, smoothed * 1.3));
        render();
      });
    };
    historyRef.current = Array(WAVE_BARS).fill(0);
    render();
    setup();
    return () => {
      unlisten?.();
    };
  }, [active]);

  return (
    <div className="classic-wave" ref={containerRef} aria-hidden="true">
      {Array.from({ length: WAVE_BARS }, (_, i) => (
        <span key={i} className="classic-wave-bar" />
      ))}
    </div>
  );
};

const Keycaps: React.FC<{ combination: string }> = ({ combination }) => (
  <span className="classic-keys">
    {combination.split(" + ").map((part, i) => (
      <span key={`${part}-${i}`} className="classic-key">
        {keyLabel(part.trim())}
      </span>
    ))}
  </span>
);

const RecordingOverlay: React.FC = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  const [style, setStyle] = useState<OverlayStyle>("classic");
  const [modeName, setModeName] = useState<string | null>(null);
  const [modeIcon, setModeIcon] = useState<string | null>(null);
  const [stopShortcut, setStopShortcut] = useState<string | null>(null);
  const [cancelShortcut, setCancelShortcut] = useState<string | null>(null);
  const osType = useOsType();
  const [timerStart, setTimerStart] = useState(0);
  const [selectedAction, setSelectedAction] = useState<ActionInfo | null>(null);
  const [cancelPending, setCancelPending] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseStartRef = useRef<number>(0);
  const direction = getLanguageDirection(i18n.language);

  const handleCancel = useCallback(() => {
    commands.cancelOperation();
  }, []);

  const handleTogglePause = useCallback(() => {
    commands.togglePause();
  }, []);

  useEffect(() => {
    let isMounted = true;
    let cleanupListeners: (() => void) | undefined;

    const setupEventListeners = async () => {
      const unlistenShow = await listen<ShowOverlayPayload | string>(
        "show-overlay",
        async (event) => {
          await syncLanguageFromSettings();
          const payload =
            typeof event.payload === "string"
              ? {
                  state: event.payload as OverlayState,
                  style: "classic" as const,
                  mode_name: null,
                }
              : event.payload;
          setState(payload.state);
          setStyle(payload.style ?? "classic");
          setModeName(payload.mode_name ?? null);
          if (typeof event.payload !== "string") {
            setModeIcon(event.payload.mode_icon ?? null);
            setStopShortcut(event.payload.stop_shortcut ?? null);
            setCancelShortcut(event.payload.cancel_shortcut ?? null);
          }
          setIsVisible(true);
          setIsPaused(false);
          if (payload.state === "recording") {
            setTimerStart(Date.now());
            setSelectedAction(null);
          }
        },
      );

      const unlistenHide = await listen("hide-overlay", () => {
        setIsVisible(false);
        setSelectedAction(null);
        setCancelPending(false);
        setIsPaused(false);
        if (cancelTimerRef.current) {
          clearTimeout(cancelTimerRef.current);
          cancelTimerRef.current = null;
        }
      });

      const unlistenCancelPending = await listen("cancel-pending", () => {
        setCancelPending(true);
        if (cancelTimerRef.current) {
          clearTimeout(cancelTimerRef.current);
        }
        cancelTimerRef.current = setTimeout(() => {
          setCancelPending(false);
          cancelTimerRef.current = null;
        }, 1700);
      });

      const unlistenAction = await listen<ActionInfo>(
        "action-selected",
        (event) => {
          setSelectedAction(event.payload);
        },
      );

      const unlistenDeselect = await listen("action-deselected", () => {
        setSelectedAction(null);
      });

      const unlistenPause = await listen<boolean>(
        "recording-paused",
        (event) => {
          const paused = event.payload;
          setIsPaused(paused);
          if (paused) {
            pauseStartRef.current = Date.now();
          } else {
            const pauseDuration = Date.now() - pauseStartRef.current;
            setTimerStart((prev) => prev + pauseDuration);
          }
        },
      );

      if (!isMounted) {
        unlistenShow();
        unlistenHide();
        unlistenCancelPending();
        unlistenAction();
        unlistenDeselect();
        unlistenPause();
        return;
      }

      cleanupListeners = () => {
        unlistenShow();
        unlistenHide();
        unlistenCancelPending();
        unlistenAction();
        unlistenDeselect();
        unlistenPause();
      };
    };

    setupEventListeners();
    return () => {
      isMounted = false;
      cleanupListeners?.();
      if (cancelTimerRef.current) {
        clearTimeout(cancelTimerRef.current);
      }
    };
  }, []);

  const isBusy =
    state === "recording" || state === "transcribing" || state === "processing";

  if (style === "classic" && isBusy) {
    const shownIcon = selectedAction?.icon ?? modeIcon;
    const ShownIcon = getActionIcon(shownIcon ?? "mic");
    const filled = shownIcon ? FILLED_ACTION_ICONS.has(shownIcon) : false;
    const shownName = selectedAction?.name ?? modeName ?? t("overlay.mode");
    const fmt = (raw: string | null) =>
      raw ? formatKeyCombination(raw, osType) : "";
    return (
      <div
        dir={direction}
        className={`classic-window state-${state} ${isVisible ? "is-visible" : "is-hidden"}`}
      >
        <div className="classic-top">
          {state === "recording" ? (
            <Waveform active={state === "recording" && !isPaused} />
          ) : (
            <div className="classic-status">
              {state === "transcribing"
                ? t("overlay.transcribing")
                : t("overlay.processing")}
            </div>
          )}
        </div>
        <div className="classic-bar">
          <span className="classic-mode" title={shownName}>
            <ShownIcon
              width={17}
              height={17}
              strokeWidth={filled ? 1.4 : 2}
              fill={filled ? "currentColor" : "none"}
            />
            <span className="classic-mode-name">{shownName}</span>
            {selectedAction?.key != null && (
              <span className="classic-key">{selectedAction.key}</span>
            )}
          </span>
          {state === "recording" && (
            <span className="classic-actions">
              {cancelPending ? (
                <span className="classic-label">
                  {t("overlay.cancelConfirm")}
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    className="classic-action"
                    onClick={() => commands.stopRecording()}
                  >
                    <span className="classic-label">{t("overlay.stop")}</span>
                    {stopShortcut && (
                      <Keycaps combination={fmt(stopShortcut)} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="classic-action"
                    onClick={handleCancel}
                  >
                    <span className="classic-label">{t("overlay.cancel")}</span>
                    {cancelShortcut && (
                      <Keycaps combination={fmt(cancelShortcut)} />
                    )}
                  </button>
                </>
              )}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      dir={direction}
      className={`recording-overlay state-${state} style-${style} ${isVisible ? "is-visible" : "is-hidden"}`}
    >
      <div className="overlay-left">
        {state === "recording" ? (
          selectedAction ? (
            <ActionIcon icon={selectedAction.icon} />
          ) : (
            <MicIcon />
          )
        ) : state === "idle" ? (
          <span className="idle-dot" />
        ) : (
          <DotsIcon />
        )}
      </div>

      {selectedAction &&
        selectedAction.key != null &&
        state === "recording" && (
          <div className="action-badge">{selectedAction.key}</div>
        )}

      <div className="overlay-middle">
        {state === "recording" && !cancelPending && (
          <>
            {style === "classic" && (
              <TimerDisplay startTime={timerStart} isPaused={isPaused} />
            )}
            <AudioBars />
          </>
        )}
        {state === "idle" && (
          <div className="transcribing-text idle-text">{t("overlay.idle")}</div>
        )}
        {state === "mode" && (
          <div className="mode-text" title={modeName ?? undefined}>
            {modeName ?? t("overlay.mode")}
          </div>
        )}
        {state === "recording" && cancelPending && (
          <div className="cancel-confirm-text">
            {t("overlay.cancelConfirm")}
          </div>
        )}
        {state === "transcribing" && (
          <div className="transcribing-text">{t("overlay.transcribing")}</div>
        )}
        {state === "processing" && (
          <div className="transcribing-text">{t("overlay.processing")}</div>
        )}
      </div>

      <div className="overlay-right">
        {state === "recording" && style === "classic" && (
          <>
            <div className="pause-button" onClick={handleTogglePause}>
              {isPaused ? <PlayIcon /> : <PauseIcon />}
            </div>
            <div className="cancel-button" onClick={handleCancel}>
              <XIcon />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default RecordingOverlay;
