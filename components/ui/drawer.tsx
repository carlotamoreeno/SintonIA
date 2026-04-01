"use client";

import * as React from "react";
import { Drawer as BaseDrawer } from "@base-ui/react/drawer";
import { cn } from "@/lib/utils";

const Drawer = BaseDrawer.Root;
const DrawerTrigger = BaseDrawer.Trigger;
const DrawerClose = BaseDrawer.Close;
const DrawerTitle = BaseDrawer.Title;
const DrawerDescription = BaseDrawer.Description;

function DrawerContent({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof BaseDrawer.Popup>) {
  return (
    <BaseDrawer.Portal>
      <BaseDrawer.Backdrop className="fixed inset-0 z-50 bg-[#1b1c17]/30 backdrop-blur-sm" />
      <BaseDrawer.Popup
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-full max-w-80 flex-col overflow-y-auto overflow-x-hidden bg-[#f0eee6] shadow-[0_24px_64px_-32px_rgba(27,28,23,0.45)]",
          className,
        )}
        {...props}
      >
        {children}
      </BaseDrawer.Popup>
    </BaseDrawer.Portal>
  );
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
};
