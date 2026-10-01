import { KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The Easy Rent 24 logo as on easyrent24.co.za: a gold key tile, the name in
 * Playfair Display, and "24" in gold. `onDark` for navy/photo backgrounds.
 */
export function BrandLogo({ onDark = false, size = "md", className }: { onDark?: boolean; size?: "md" | "lg"; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "flex items-center justify-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 shadow-glow",
          size === "lg" ? "h-10 w-10" : "h-9 w-9"
        )}
      >
        <KeyRound className={cn("text-white", size === "lg" ? "h-5 w-5" : "h-4 w-4")} />
      </span>
      <span className={cn("font-serif font-semibold tracking-tight whitespace-nowrap", size === "lg" ? "text-2xl" : "text-xl", onDark ? "text-white" : "text-brand-900")}>
        Easy Rent <span className="text-gold">24</span>
      </span>
    </span>
  );
}
