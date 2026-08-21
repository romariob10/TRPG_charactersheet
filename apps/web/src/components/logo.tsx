import Link from "next/link";
import { Dices } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({
  compact = false,
  href = "/",
  className,
  labelClassName,
}: {
  compact?: boolean;
  href?: string;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-bold tracking-tight", className)}>
      <span className="grid size-8 place-items-center rounded-[var(--radius-control)] bg-[var(--brand)] text-white">
        <Dices className="size-[18px]" suppressHydrationWarning />
      </span>
      {!compact && <span className={cn("text-[17px]", labelClassName)}>MyCharacter</span>}
    </Link>
  );
}
