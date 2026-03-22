import { cn } from "@/lib/utils";

type SintoniaWordmarkProps = {
  className?: string;
};

export function SintoniaWordmark({ className }: SintoniaWordmarkProps) {
  return (
    <span
      className={cn(
        "font-display text-2xl font-bold tracking-[-0.03em] text-[#274f3d]",
        className,
      )}
    >
      SintonIA
    </span>
  );
}
