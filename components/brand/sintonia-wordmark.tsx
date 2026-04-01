import Image from "next/image";
import { cn } from "@/lib/utils";

type SintoniaWordmarkProps = {
  className?: string;
};

export function SintoniaWordmark({ className }: SintoniaWordmarkProps) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <Image
        alt="SintonIA"
        className="h-auto w-[10.5rem]"
        height={36}
        priority
        src="/brand/sintonia-wordmark.svg"
        width={189}
      />
    </span>
  );
}
