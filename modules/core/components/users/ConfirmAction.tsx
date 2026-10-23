"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ReactNode } from "react";

interface ConfirmActionProps {
  trigger?: ReactNode;
  title: string;
  description: string;
  onConfirm: () => void | Promise<void>;
  actionLabel?: string;
  cancelLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ConfirmAction({
  trigger,
  title,
  description,
  onConfirm,
  actionLabel = "Potvrdit",
  cancelLabel = "Zrušit",
  open,
  onOpenChange,
}: ConfirmActionProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && (
        <AlertDialogTrigger asChild>
          {trigger}
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
