"use client";
import { agentGradient } from "@/lib/agent-colors";

interface AgentAvatarProps {
  name: string;
  emoji?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  isOnline?: boolean;
}

const SIZES = {
  sm: { container: "w-6 h-6", text: "text-[10px]", emoji: "text-sm", dot: "w-1.5 h-1.5" },
  md: { container: "w-7 h-7", text: "text-xs", emoji: "text-base", dot: "w-2 h-2" },
  lg: { container: "w-8 h-8", text: "text-sm", emoji: "text-lg", dot: "w-2.5 h-2.5" },
  xl: { container: "w-16 h-16", text: "text-2xl", emoji: "text-3xl", dot: "w-3 h-3" },
};

export default function AgentAvatar({ name, emoji, size = "md", isOnline }: AgentAvatarProps) {
  const s = SIZES[size];
  const hasEmoji = emoji && emoji.trim().length > 0;

  return (
    <div className="relative flex-shrink-0">
      <div
        className={`${s.container} rounded-full flex items-center justify-center font-bold`}
        style={{ background: hasEmoji ? "transparent" : agentGradient(name) }}
      >
        {hasEmoji ? (
          <span className={s.emoji}>{emoji}</span>
        ) : (
          <span className={s.text} style={{ color: "white" }}>{name.charAt(0).toUpperCase()}</span>
        )}
      </div>
      {isOnline !== undefined && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${s.dot} rounded-full border ${
            isOnline ? "bg-emerald-400" : "bg-gray-600"
          }`}
          style={{ borderColor: "#0a0e1a" }}
        />
      )}
    </div>
  );
}
