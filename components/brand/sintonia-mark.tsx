import Image from "next/image";
import { cn } from "@/lib/utils";

type SintoniaMarkProps = {
  className?: string;
  size?: number;
};

export function SintoniaMark({ className, size = 20 }: SintoniaMarkProps) {
  return (
    <Image
      alt="SintonIA"
      className={cn("shrink-0", className)}
      height={size}
      priority
      src="/brand/sintonia-mark.svg"
      width={size}
    />
  );
}
