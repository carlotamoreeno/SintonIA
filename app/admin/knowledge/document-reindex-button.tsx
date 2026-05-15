"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const REINDEX_ENDPOINT = "/api/admin/knowledge/reindex";

type DocumentReindexButtonProps = {
  datasetVersion: string;
  docId: string;
  documentTitle: string;
  documentVersion: number;
};

function getReindexErrorMessage(status: number) {
  if (status === 409) {
    return "El documento no se puede reindexar en su estado actual.";
  }

  if (status === 400) {
    return "La identidad documental no es valida.";
  }

  if (status === 401 || status === 403) {
    return "Tu sesion no tiene permisos para realizar esta operacion.";
  }

  return "No se pudo completar el reindexado del documento.";
}

export function DocumentReindexButton({
  datasetVersion,
  docId,
  documentTitle,
  documentVersion,
}: DocumentReindexButtonProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const isBusy = isSubmitting || isPending;

  async function handleReindex() {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(REINDEX_ENDPOINT, {
        body: JSON.stringify({
          datasetVersion,
          docId,
          documentVersion,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        setErrorMessage(getReindexErrorMessage(response.status));
        return;
      }

      setSuccessMessage("Documento reindexado.");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setErrorMessage("No se pudo conectar con el servicio de reindexado.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid max-w-44 gap-2">
      <Button
        aria-label={`Reindexar ${documentTitle}`}
        className="border-[#b7d2be] bg-white text-[#274f3d] shadow-none hover:bg-[#eef6e9]"
        disabled={isBusy}
        onClick={handleReindex}
        size="sm"
        type="button"
        variant="outline"
      >
        {isBusy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        )}
        Reindexar
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
