import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Sparkles, X, Zap } from "lucide-react";
import type { LocalLlmModelInfo } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { useLocalLlmStore } from "@/stores/localLlmStore";
import { Button, Dropdown, Textarea } from "@/components/ui";

const FALLBACK_PROMPT =
  "Fix punctuation and capitalization. Keep the original language.\n\n${output}";

/**
 * "Try" sub-row shown under a downloaded on-device language model: runs a
 * mode prompt on a sample text to check speed and quality on this machine.
 */
export const TryPanel: React.FC<{
  model: LocalLlmModelInfo;
  onClose: () => void;
}> = ({ model, onClose }) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const testModel = useLocalLlmStore((state) => state.testModel);
  const actions = (settings?.post_process_actions ?? []).filter(
    (a) => a.prompt.trim() !== "",
  );
  const [actionId, setActionId] = useState<string>(actions[0]?.id ?? "");
  const [text, setText] = useState(() => t("models.ai.trySample"));
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const prompt =
    actions.find((a) => a.id === actionId)?.prompt ?? FALLBACK_PROMPT;

  const run = async () => {
    setRunning(true);
    setError(null);
    setOutput(null);
    const start = performance.now();
    try {
      const result = await testModel(model.id, prompt, text);
      setOutput(result);
      setElapsed((performance.now() - start) / 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-2 mb-2 mt-1 rounded-xl border border-border bg-surface-2/60 px-4 py-3.5 flex flex-col gap-3 wsm-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            {t("models.ai.tryTitle", { model: model.name })}
          </h3>
          <p className="text-[13px] text-text-muted mt-0.5">
            {t("models.ai.tryHint")}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-3"
          aria-label={t("common.close")}
          title={t("common.close")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {actions.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-text-muted">
            {t("models.ai.tryMode")}
          </span>
          <Dropdown
            selectedValue={actionId}
            options={actions.map((a) => ({ value: a.id, label: a.name }))}
            onSelect={setActionId}
            className="w-[240px]"
          />
        </div>
      )}

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full block min-h-[72px]"
        variant="compact"
      />

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="md"
          onClick={run}
          disabled={running || !text.trim()}
        >
          {running ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          {running ? t("models.ai.running") : t("models.ai.run")}
        </Button>
        {elapsed !== null && output !== null && (
          <span className="text-[13px] text-text-muted tabular-nums">
            {t("models.ai.elapsed", { seconds: elapsed.toFixed(1) })}
          </span>
        )}
      </div>

      {output !== null && (
        <div className="rounded-lg bg-surface border border-border px-3 py-2 text-sm leading-relaxed select-text whitespace-pre-wrap">
          {output}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {error}
        </div>
      )}
    </div>
  );
};

export default TryPanel;
