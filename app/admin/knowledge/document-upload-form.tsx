"use client";

import { type FormEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const UPLOAD_ENDPOINT = "/api/admin/knowledge/documents";

function getUploadErrorMessage(status: number) {
  if (status === 409) {
    return "Ya existe un documento con ese archivo o identidad catalogal.";
  }

  if (status === 400) {
    return "Revisa los campos y adjunta un PDF valido.";
  }

  if (status === 401 || status === 403) {
    return "Tu sesion no tiene permisos para realizar esta operacion.";
  }

  return "No se pudo completar la subida e indexacion del documento.";
}

export function DocumentUploadForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isBusy = isSubmitting || isPending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch(UPLOAD_ENDPOINT, {
        body: formData,
        method: "POST",
      });

      if (!response.ok) {
        setErrorMessage(getUploadErrorMessage(response.status));
        return;
      }

      formRef.current?.reset();
      setSuccessMessage("Documento subido e indexado.");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setErrorMessage("No se pudo conectar con el servicio de subida.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="rounded-lg border border-[rgba(191,201,193,0.55)] bg-white/85 shadow-none">
      <CardHeader>
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-[#edf7fb] text-[#2f566d]">
          <UploadCloud className="size-5" />
        </div>
        <CardTitle>Subir documento</CardTitle>
        <CardDescription>
          PDF canonico con identidad documental explicita.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          aria-label="Subida documental"
          className="grid gap-4"
          encType="multipart/form-data"
          onSubmit={handleSubmit}
          ref={formRef}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="datasetVersion">Dataset</Label>
              <Input
                autoComplete="off"
                id="datasetVersion"
                name="datasetVersion"
                placeholder="mvp-2026-03"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="docId">Doc ID</Label>
              <Input
                autoComplete="off"
                id="docId"
                name="docId"
                placeholder="guia-cultivo"
                required
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_10rem]">
            <div className="grid gap-2">
              <Label htmlFor="title">Titulo</Label>
              <Input
                autoComplete="off"
                id="title"
                name="title"
                placeholder="Guia de cultivo"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="documentVersion">Version</Label>
              <Input
                id="documentVersion"
                min={1}
                name="documentVersion"
                required
                step={1}
                type="number"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="file">PDF</Label>
            <Input
              accept="application/pdf"
              id="file"
              name="file"
              required
              type="file"
            />
          </div>

          {errorMessage ? (
            <div
              className="flex items-start gap-2 rounded-lg border border-[#f0d2d2] bg-[#fff7f4] px-3 py-2 text-sm text-[#8a3d2c]"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          {successMessage ? (
            <div
              className="flex items-start gap-2 rounded-lg border border-[#b7d2be] bg-[#eef6e9] px-3 py-2 text-sm text-[#274f3d]"
              role="status"
            >
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          ) : null}

          <div>
            <Button
              className="bg-[#274f3d] text-white hover:bg-[#1f4031]"
              disabled={isBusy}
              size="lg"
              type="submit"
            >
              {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Subir e indexar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
