import type { LucideIcon } from "lucide-react";
import {
  Sparkles,
  Wand2,
  Stars,
  Bot,
  Brain,
  Languages,
  SpellCheck,
  PenLine,
  FileText,
  ListChecks,
  ScrollText,
  Mail,
  MessageSquare,
  Quote,
  Scissors,
  Eraser,
  Hash,
  Code2,
  Terminal,
  Briefcase,
  GraduationCap,
  Lightbulb,
  Rocket,
  Zap,
  Heart,
  Smile,
  Megaphone,
  ThumbsUp,
  BookOpen,
  Feather,
  Mic,
  MessageCircle,
  Users,
  SquareDashed,
  Star,
} from "lucide-react";

/**
 * Curated set of icons that can be assigned to a post-process action.
 * Keys are stable identifiers persisted in settings; do not rename existing
 * ones without a migration.
 */
export const ACTION_ICONS: Record<string, LucideIcon> = {
  mic: Mic,
  sparkles: Sparkles,
  wand: Wand2,
  stars: Stars,
  bot: Bot,
  brain: Brain,
  languages: Languages,
  spellcheck: SpellCheck,
  pen: PenLine,
  file: FileText,
  checklist: ListChecks,
  scroll: ScrollText,
  mail: Mail,
  chat: MessageSquare,
  quote: Quote,
  scissors: Scissors,
  eraser: Eraser,
  hash: Hash,
  code: Code2,
  terminal: Terminal,
  briefcase: Briefcase,
  graduation: GraduationCap,
  lightbulb: Lightbulb,
  rocket: Rocket,
  zap: Zap,
  heart: Heart,
  smile: Smile,
  megaphone: Megaphone,
  thumbsup: ThumbsUp,
  book: BookOpen,
  feather: Feather,
  message: MessageCircle,
  users: Users,
  "square-dashed": SquareDashed,
  star: Star,
};

/** Icons drawn filled, like the SF Symbols of the reference app. */
export const FILLED_ACTION_ICONS = new Set(["message", "star", "heart", "zap"]);

export const ACTION_ICON_NAMES = Object.keys(ACTION_ICONS);

export const DEFAULT_ACTION_ICON = "sparkles";

export const getActionIcon = (name?: string | null): LucideIcon =>
  (name && ACTION_ICONS[name]) || ACTION_ICONS[DEFAULT_ACTION_ICON];
