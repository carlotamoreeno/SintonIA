"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { signInWithGoogle } from "@/app/auth-actions";
import { cn } from "@/lib/utils";

type GoogleSignInFormProps = {
  buttonClassName?: string;
  callbackUrl?: string;
  className?: string;
  icon?: ReactNode;
  label?: string;
  trailingIcon?: ReactNode;
};

export function GoogleSignInForm({
  buttonClassName,
  callbackUrl = "/",
  className,
  icon = (
    <Image
      alt=""
      aria-hidden="true"
      className="size-5"
      height={20}
      src="/figma/google-mark.svg"
      unoptimized
      width={20}
    />
  ),
  label = "Continuar con Google",
  trailingIcon,
}: GoogleSignInFormProps) {
  return (
    <form action={signInWithGoogle} className={className}>
      <input name="callbackUrl" type="hidden" value={callbackUrl} />
      <button
        className={cn(
          "botanical-focus inline-flex h-11 w-full items-center justify-center gap-3 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_10px_15px_-3px_rgba(39,79,61,0.15),0_4px_6px_-4px_rgba(39,79,61,0.15)] transition hover:translate-y-[-1px] hover:bg-[#1f4031]",
          buttonClassName,
        )}
        type="submit"
      >
        {icon}
        <span>{label}</span>
        {trailingIcon}
      </button>
    </form>
  );
}
