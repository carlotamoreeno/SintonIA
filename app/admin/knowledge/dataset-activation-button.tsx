"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACTIVATE_DATASET_ENDPOINT = "/api/admin/knowledge/datasets/activate";

type DatasetActivationButtonProps = {
  datasetVersion: string;
  isActive: boolean;
};

function getActivationErrorMessage(status: number) {
  if (status === 409) {
    return "El dataset no tiene un vector store registrado.";
  }

  if (status === 400) {
    return "La identidad del dataset no es valida.";
  }

  if (status === 401 || status === 403) {
    return "Tu sesion no tiene permisos para realizar esta operacion.";
  }

  return "No se pudo activar el dataset.";
}

export function DatasetActivationButton({
  datasetVersion,
  isActive,
}: DatasetActivationButtonProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const isBusy = isSubmitting || isPending;

  async function handleActivate() {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(ACTIVATE_DATASET_ENDPOINT, {
        body: JSON.stringify({
          datasetVersion,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        setErrorMessage(getActivationErrorMessage(response.status));
        return;
      }

      const result = (await response.json()) as { changed?: boolean };

      setSuccessMessage(
        result.changed === false ? "Dataset ya activo." : "Dataset activado.",
      );
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setErrorMessage("No se pudo conectar con el servicio de activacion.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid max-w-44 gap-2">
      <Button
        aria-label={`Activar dataset ${datasetVersion}`}
        className="border-[#b7d2be] bg-white text-[#274f3d] shadow-none hover:bg-[#eef6e9]"
        disabled={isBusy || isActive}
        onClick={handleActivate}
        size="sm"
        type="button"
        variant="outline"
      >
        {isBusy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Power className="size-4" />
        )}
        {isActive ? "Activo" : "Activar"}
      </Button>

      {errorMessage ? (
        <p
          className="flex items-start gap-1 rounded-md border border-[#f0d2d2] bg-[#fff7f4] px-2 py-1 text-xs leading-5 text-[#8a3d2c]"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </p>
      ) : null}

      {successMessage ? (
        <p
          className="flex items-start gap-1 rounded-md border border-[#b7d2be] bg-[#eef6e9] px-2 py-1 text-xs leading-5 text-[#274f3d]"
          role="status"
        >
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
          <span>{successMessage}</span>
        </p>
      ) : null}
    </div>
  );
}
