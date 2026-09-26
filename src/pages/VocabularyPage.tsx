import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { ArrowRight, FileDown, X } from "lucide-react";
import type { VocabularyReplacement } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { useOsType } from "@/hooks/useOsType";
import { Kbd } from "@/components/ui";

const ENTER_KEY = "⏎";
const ESCAPE_KEY = "Esc";
const MAC_MODIFIER_KEY = "⌘";
const OTHER_MODIFIER_KEY = "Ctrl";
/** "heard -> written" or "heard → written" on one line. */
const REPLACEMENT_LINE = /^(.*?)\s*(?:->|→)\s*(.*)$/;

interface Vocabulary {
  words: string[];
  replacements: VocabularyReplacement[];
}

interface MergeResult extends Vocabulary {
  added: number;
  wordsChanged: boolean;
  replacementsChanged: boolean;
}

const normalize = (value: string) => value.trim().toLocaleLowerCase();

/** One entry per line; lines with "->" or "→" become replacements. */
const parseVocabularyFile = (content: string): Vocabulary => {
  const words: string[] = [];
  const replacements: VocabularyReplacement[] = [];
  for (const rawLine of content.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = rawLine
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .trim();
    if (!line) continue;
    const match = line.match(REPLACEMENT_LINE);
    if (match) {
      const from = match[1].trim();
      const to = match[2].trim();
      if (from && to) replacements.push({ from, to });
      continue;
    }
    words.push(line);
  }
  return { words, replacements };
};

/**
 * Add entries to the vocabulary, skipping anything already present
 * (case-insensitive, against both words and replacement sources). A word that
 * becomes the source of a new replacement is dropped from the plain words.
 */
const mergeVocabulary = (
  current: Vocabulary,
  incoming: Vocabulary,
): MergeResult => {
  let words = [...current.words];
  const replacements = [...current.replacements];
  const sources = new Set(replacements.map((r) => normalize(r.from)));
  let added = 0;
  let wordsChanged = false;
  let replacementsChanged = false;

  for (const entry of incoming.replacements) {
    const from = entry.from.trim();
    const to = entry.to.trim();
    const key = normalize(from);
    if (!key || !to || sources.has(key)) continue;
    sources.add(key);
    const remaining = words.filter((w) => normalize(w) !== key);
    if (remaining.length !== words.length) {
      words = remaining;
      wordsChanged = true;
    }
    replacements.push({ from, to });
    replacementsChanged = true;
    added++;
  }

  const known = new Set([...words.map(normalize), ...sources]);
  for (const raw of incoming.words) {
    const word = raw.trim();
    const key = normalize(word);
    if (!key || known.has(key)) continue;
    known.add(key);
    words.push(word);
    wordsChanged = true;
    added++;
  }

  return { words, replacements, added, wordsChanged, replacementsChanged };
};

const inlineActionClass =
  "flex items-center gap-2 h-9 px-2.5 rounded-lg text-[14px] text-text-muted shrink-0 transition-colors enabled:hover:text-text enabled:hover:bg-surface-2 disabled:opacity-50 cursor-pointer disabled:cursor-default";

const RemoveButton: React.FC<{ label: string; onClick: () => void }> = ({
  label,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    aria-label={label}
    className="ms-auto shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md text-text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger hover:bg-danger/10 transition-[opacity,color,background-color] cursor-pointer"
  >
    <X className="w-4 h-4" />
  </button>
);

export const VocabularyPage: React.FC = () => {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const osType = useOsType();
  const modifierKey =
    osType === "macos" ? MAC_MODIFIER_KEY : OTHER_MODIFIER_KEY;

  const words = settings?.custom_words ?? [];
  const replacements = settings?.vocabulary_replacements ?? [];

  const [draft, setDraft] = useState("");
  /** Source of the replacement being written; null in normal mode. */
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const [replacementDraft, setReplacementDraft] = useState("");

  const persist = async (result: MergeResult) => {
    const updates: Promise<void>[] = [];
    if (result.wordsChanged) {
      updates.push(updateSetting("custom_words", result.words));
    }
    if (result.replacementsChanged) {
      updates.push(
        updateSetting("vocabulary_replacements", result.replacements),
      );
    }
    await Promise.all(updates);
  };

  const addWord = () => {
    const word = draft.trim();
    if (!word) return;
    const result = mergeVocabulary(
      { words, replacements },
      { words: [word], replacements: [] },
    );
    if (result.added === 0) {
      toast(t("vocabulary.duplicate", { word }));
      return;
    }
    setDraft("");
    void persist(result);
  };

  const startReplacement = () => {
    const from = draft.trim();
    if (!from) return;
    const key = normalize(from);
    if (replacements.some((r) => normalize(r.from) === key)) {
      toast(t("vocabulary.duplicate", { word: from }));
      return;
    }
    setPendingFrom(from);
    setReplacementDraft("");
    setDraft("");
  };

  const cancelReplacement = () => {
    if (pendingFrom !== null) setDraft(pendingFrom);
    setPendingFrom(null);
    setReplacementDraft("");
  };

  const saveReplacement = () => {
    if (pendingFrom === null) return;
    const to = replacementDraft.trim();
    if (!to) return;
    const result = mergeVocabulary(
      { words, replacements },
      { words: [], replacements: [{ from: pendingFrom, to }] },
    );
    if (result.added === 0) {
      toast(t("vocabulary.duplicate", { word: pendingFrom }));
      return;
    }
    setPendingFrom(null);
    setReplacementDraft("");
    void persist(result);
  };

  const removeWord = (index: number) => {
    void updateSetting(
      "custom_words",
      words.filter((_, i) => i !== index),
    );
  };

  const removeReplacement = (index: number) => {
    void updateSetting(
      "vocabulary_replacements",
      replacements.filter((_, i) => i !== index),
    );
  };

  const handleImport = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Text", extensions: ["txt", "csv"] }],
      });
      if (!selected) return;
      const content = await readTextFile(selected);
      const result = mergeVocabulary(
        { words, replacements },
        parseVocabularyFile(content),
      );
      await persist(result);
      toast.success(t("vocabulary.imported", { count: result.added }));
    } catch (error) {
      console.error("Failed to import vocabulary:", error);
      toast.error(t("vocabulary.importFailed"));
    }
  };

  const onDraftKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (event.metaKey || event.ctrlKey) {
      startReplacement();
    } else {
      addWord();
    }
  };

  const onReplacementKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      saveReplacement();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelReplacement();
    }
  };

  // Keep the caret in the text field when an inline action is clicked.
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();

  const hasDraft = draft.trim() !== "";
  const replacementRows = replacements
    .map((entry, index) => ({ entry, index }))
    .reverse();
  const wordRows = words.map((word, index) => ({ word, index })).reverse();
  const isEmpty = replacementRows.length === 0 && wordRows.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[22px] font-semibold tracking-tight leading-tight">
          {t("vocabulary.title")}
        </h1>
        <button
          type="button"
          onClick={handleImport}
          title={t("vocabulary.import")}
          aria-label={t("vocabulary.import")}
          className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors cursor-pointer"
        >
          <FileDown className="w-[18px] h-[18px]" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {pendingFrom === null ? (
          <div className="wsm-card h-14 flex items-center gap-2 ps-5 pe-2.5 transition-colors focus-within:border-accent/50">
            <input
              type="text"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onDraftKeyDown}
              placeholder={t("vocabulary.placeholder")}
              aria-label={t("vocabulary.placeholder")}
              className="flex-1 min-w-0 h-full bg-transparent border-none outline-none text-[16px] text-text placeholder:text-text-muted/70"
            />
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={addWord}
              disabled={!hasDraft}
              className={inlineActionClass}
            >
              {t("vocabulary.addWord")}
              <Kbd>{ENTER_KEY}</Kbd>
            </button>
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={startReplacement}
              disabled={!hasDraft}
              className={inlineActionClass}
            >
              {t("vocabulary.replaceWith")}
              <span className="inline-flex items-center gap-1">
                <Kbd>{modifierKey}</Kbd>
                <Kbd>{ENTER_KEY}</Kbd>
              </span>
            </button>
          </div>
        ) : (
          <div className="wsm-card h-14 flex items-center gap-2.5 ps-3 pe-2.5 border-accent/50">
            <span
              className="max-w-[40%] shrink-0 truncate h-8 px-3 inline-flex items-center rounded-lg bg-surface-2 text-[15px] text-text"
              title={pendingFrom}
            >
              {pendingFrom}
            </span>
            <ArrowRight className="w-4 h-4 shrink-0 text-text-muted" />
            <input
              type="text"
              autoFocus
              value={replacementDraft}
              onChange={(e) => setReplacementDraft(e.target.value)}
              onKeyDown={onReplacementKeyDown}
              placeholder={t("vocabulary.replacementPlaceholder")}
              aria-label={t("vocabulary.replacementPlaceholder")}
              className="flex-1 min-w-0 h-full bg-transparent border-none outline-none text-[16px] text-text placeholder:text-text-muted/70"
            />
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={cancelReplacement}
              className={inlineActionClass}
            >
              {t("vocabulary.cancel")}
              <Kbd>{ESCAPE_KEY}</Kbd>
            </button>
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={saveReplacement}
              disabled={replacementDraft.trim() === ""}
              className={`${inlineActionClass} enabled:text-accent enabled:hover:text-accent`}
            >
              {t("vocabulary.confirmReplacement")}
              <Kbd>{ENTER_KEY}</Kbd>
            </button>
          </div>
        )}
        <p className="text-[13px] text-text-muted px-1">
          {t("vocabulary.importHint")}
        </p>
      </div>

      {settings &&
        (isEmpty ? (
          <div className="wsm-card border-dashed px-6 py-10 text-center">
            <p className="text-[14px] text-text-muted leading-relaxed max-w-md mx-auto">
              {t("vocabulary.empty")}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col -mt-2">
            {replacementRows.map(({ entry, index }) => (
              <li
                key={`r-${index}-${entry.from}`}
                className="group flex items-center gap-3 h-12 ps-5 pe-2 rounded-xl hover:bg-surface/70 transition-colors"
              >
                <span className="w-[38%] min-w-0 truncate text-[15px] text-text">
                  {entry.from}
                </span>
                <span className="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-md bg-surface-3 text-text-muted">
                  <ArrowRight className="w-4 h-4" />
                </span>
                <span className="flex-1 min-w-0 truncate text-[15px] text-text">
                  {entry.to}
                </span>
                <RemoveButton
                  label={t("vocabulary.remove", { word: entry.from })}
                  onClick={() => removeReplacement(index)}
                />
              </li>
            ))}
            {wordRows.map(({ word, index }) => (
              <li
                key={`w-${index}-${word}`}
                className="group flex items-center gap-3 h-12 ps-5 pe-2 rounded-xl hover:bg-surface/70 transition-colors"
              >
                <span className="flex-1 min-w-0 truncate text-[15px] text-text">
                  {word}
                </span>
                <RemoveButton
                  label={t("vocabulary.remove", { word })}
                  onClick={() => removeWord(index)}
                />
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
};
