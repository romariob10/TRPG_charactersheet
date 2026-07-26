import Link from "next/link";
import { Dices } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2 font-bold tracking-tight", className)}>
      <span className="grid size-8 place-items-center rounded-[var(--radius-control)] bg-[var(--brand)] text-white">
        <Dices className="size-[18px]" />
      </span>
      {!compact && <span className="text-[17px]">MyCharacter</span>}
    </Link>
  );
}
