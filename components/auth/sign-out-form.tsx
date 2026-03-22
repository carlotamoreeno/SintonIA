"use client";

import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { signOutCurrentUser } from "@/app/auth-actions";
import { cn } from "@/lib/utils";

type SignOutFormProps = {
  buttonClassName?: string;
  children?: ReactNode;
  className?: string;
  icon?: ReactNode;
  label?: string;
};

export function SignOutForm({
  buttonClassName,
  children,
  className,
  icon = <LogOut className="size-4" />,
  label = "Cerrar sesion",
}: SignOutFormProps) {
  return (
    <form action={signOutCurrentUser} className={className}>
      <button
        className={cn(
          "botanical-focus inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(191,201,193,0.55)] bg-white px-4 text-sm font-semibold text-[#274f3d] transition hover:bg-[#f6f4ec]",
          buttonClassName,
        )}
        type="submit"
      >
        {children ?? (
          <>
            <span>{label}</span>
            {icon}
          </>
        )}
      </button>
    </form>
  );
}
