import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  FileText,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { SintoniaWordmark } from "@/components/brand/sintonia-wordmark";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { buildRelativeSignInUrl } from "@/lib/auth/access";
import {
  canAccessDocumentaryAdmin,
  type DocumentaryAdminRole,
} from "@/lib/auth/admin-access";
import { getOptionalAppSession } from "@/lib/auth/app-session";
import {
  knowledgeDocumentCatalogStore,
  type KnowledgeDocumentCatalogDocument,
  type KnowledgeDocumentCatalogStatus,
} from "@/lib/supabase/knowledge-document-store";

export const dynamic = "force-dynamic";

const ADMIN_KNOWLEDGE_DOCUMENT_LIMIT = 100;

type DocumentInventoryState =
  | {
      documents: KnowledgeDocumentCatalogDocument[];
      status: "ready";
    }
  | {
      status: "error";
    };

const statusConfig = {
  attached: {
    className: "border-[#b7d2be] bg-[#eef6e9] text-[#274f3d]",
    label: "Adjuntado",
    variant: "outline",
  },
  failed: {
    className: "border-[#f0d2d2] bg-[#fff2f2] text-[#8a3d2c]",
    label: "Con error",
    variant: "destructive",
  },
  pending: {
    className: "border-[#d6d0c5] bg-[#f6f4ec] text-[#566342]",
    label: "Pendiente",
    variant: "outline",
  },
  ready: {
    className: "border-[#b7d2be] bg-[#dae8be] text-[#274f3d]",
    label: "Listo",
    variant: "secondary",
  },
  retired: {
    className: "border-[#d6d0c5] bg-white text-[#707973]",
    label: "Retirado",
    variant: "outline",
  },
  uploaded: {
    className: "border-[#c3d7e6] bg-[#edf7fb] text-[#2f566d]",
    label: "Subido",
    variant: "outline",
  },
} satisfies Record<
  KnowledgeDocumentCatalogStatus,
  {
    className: string;
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
>;

type AdminKnowledgeShellProps = {
  email: string | null;
  inventory: DocumentInventoryState;
  name: string | null;
  role: DocumentaryAdminRole;
};

function hasDocumentProblem(document: KnowledgeDocumentCatalogDocument) {
  return document.status === "failed" || Boolean(document.lastError);
}

function formatOptionalValue(value: string | null) {
  return value && value.trim().length > 0 ? value : "Pendiente";
}

function formatIndexedAt(value: string | null) {
  if (!value) {
    return "Sin indexar";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function KnowledgeStatusBadge({
  status,
}: {
  status: KnowledgeDocumentCatalogStatus;
}) {
  const config = statusConfig[status];

  return (
    <Badge className={config.className} variant={config.variant}>
      {config.label}
    </Badge>
  );
}

function DocumentInventoryTable({
  documents,
}: {
  documents: KnowledgeDocumentCatalogDocument[];
}) {
  return (
    <Card className="rounded-lg border border-[rgba(191,201,193,0.55)] bg-white/85 shadow-none">
      <CardHeader>
        <CardTitle>Inventario documental</CardTitle>
        <CardDescription>
          Mostrando hasta {ADMIN_KNOWLEDGE_DOCUMENT_LIMIT} documentos
          catalogados.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="border-[rgba(191,201,193,0.55)]">
              <TableHead>Documento</TableHead>
              <TableHead>Dataset</TableHead>
              <TableHead>Identidad</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>OpenAI</TableHead>
              <TableHead>Vector store</TableHead>
              <TableHead>Indexado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((document) => (
              <TableRow
                className="border-[rgba(191,201,193,0.45)] hover:bg-[#f6f4ec]/70"
                key={document.id}
              >
                <TableCell className="min-w-64 whitespace-normal align-top">
                  <p className="font-medium text-[#1b1c17]">{document.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[#707973]">
                    {document.originalFilename}
                  </p>
                </TableCell>
                <TableCell className="whitespace-normal align-top text-sm text-[#404943]">
                  {document.datasetVersion}
                </TableCell>
                <TableCell className="min-w-48 whitespace-normal align-top">
                  <p className="font-mono text-xs text-[#404943]">
                    {document.docId}
                  </p>
                  <p className="mt-1 text-xs text-[#707973]">
                    v{document.documentVersion}
                  </p>
                </TableCell>
                <TableCell className="min-w-52 whitespace-normal align-top">
                  <KnowledgeStatusBadge status={document.status} />
                  {document.lastError ? (
                    <p className="mt-2 max-w-xs whitespace-normal rounded-md bg-[#fff6f1] px-2 py-1 text-xs leading-5 text-[#8a3d2c]">
                      {document.lastError}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="max-w-48 whitespace-normal break-all align-top font-mono text-xs text-[#404943]">
                  {formatOptionalValue(document.openAIFileId)}
                </TableCell>
                <TableCell className="max-w-48 whitespace-normal break-all align-top font-mono text-xs text-[#404943]">
                  {formatOptionalValue(document.vectorStoreId)}
                </TableCell>
                <TableCell className="whitespace-normal align-top text-sm text-[#404943]">
                  {formatIndexedAt(document.lastIndexedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DocumentInventory({
  inventory,
}: {
  inventory: DocumentInventoryState;
}) {
  if (inventory.status === "error") {
    return (
      <Card className="rounded-lg border border-[#f0d2d2] bg-[#fff7f4] shadow-none">
        <CardHeader>
          <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-white text-[#8a3d2c]">
            <AlertTriangle className="size-5" />
          </div>
          <CardTitle>No se pudo cargar el inventario documental</CardTitle>
          <CardDescription>
            El panel mantiene el acceso protegido, pero la consulta del catalogo
            no devolvio una respuesta usable.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const documents = inventory.documents;
  const readyCount = documents.filter(
    (document) => document.status === "ready",
  ).length;
  const problemCount = documents.filter(hasDocumentProblem).length;

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-lg border border-[rgba(191,201,193,0.55)] bg-white/80 shadow-none">
          <CardHeader>
            <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-[#dae8be] text-[#274f3d]">
              <Archive className="size-5" />
            </div>
            <CardTitle>{documents.length}</CardTitle>
            <CardDescription>Documentos cargados</CardDescription>
          </CardHeader>
        </Card>
        <Card className="rounded-lg border border-[rgba(191,201,193,0.55)] bg-white/80 shadow-none">
          <CardHeader>
            <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-[#eef6e9] text-[#274f3d]">
              <CheckCircle2 className="size-5" />
            </div>
            <CardTitle>{readyCount}</CardTitle>
            <CardDescription>Listos para consulta</CardDescription>
          </CardHeader>
        </Card>
        <Card className="rounded-lg border border-[rgba(191,201,193,0.55)] bg-white/80 shadow-none">
          <CardHeader>
            <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-[#fff2f2] text-[#8a3d2c]">
              <AlertTriangle className="size-5" />
            </div>
            <CardTitle>{problemCount}</CardTitle>
            <CardDescription>Con incidencias visibles</CardDescription>
          </CardHeader>
        </Card>
      </div>

      {documents.length > 0 ? (
        <DocumentInventoryTable documents={documents} />
      ) : (
        <Card className="rounded-lg border border-[rgba(191,201,193,0.55)] bg-white/85 shadow-none">
          <CardHeader>
            <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-[#f6f4ec] text-[#566342]">
              <FileText className="size-5" />
            </div>
            <CardTitle>No hay documentos catalogados</CardTitle>
            <CardDescription>
              El catalogo documental no tiene filas disponibles para mostrar.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

function AdminKnowledgeShell({
  email,
  inventory,
  name,
  role,
}: AdminKnowledgeShellProps) {
  return (
    <main className="min-h-screen bg-[#f6f4ec] text-[#1b1c17]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-6 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(191,201,193,0.55)] pb-5">
          <Link aria-label="Ir al inicio" href="/">
            <SintoniaWordmark />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              className="botanical-focus inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-medium text-[#566342] transition hover:bg-white/70"
              href="/chat"
            >
              Chat
            </Link>
            <SignOutForm
              buttonClassName="h-9 rounded-lg bg-white/75 px-3 text-sm shadow-none hover:bg-white"
              label="Cerrar sesion"
            />
          </div>
        </header>

        <section className="grid flex-1 content-start gap-8 py-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-3xl space-y-3">
              <p className="text-xs font-semibold uppercase text-[#707973]">
                Administracion documental
              </p>
              <h1 className="font-display text-4xl font-bold leading-tight text-[#1b1c17] sm:text-5xl">
                Panel documental
              </h1>
              <p className="max-w-2xl text-base leading-7 text-[#566342]">
                Base protegida para revisar el catalogo y los estados de
                indexacion del MVP.
              </p>
            </div>
            <div className="rounded-xl border border-[rgba(191,201,193,0.75)] bg-white/75 px-4 py-3 text-sm text-[#404943]">
              <p className="font-semibold text-[#274f3d]">
                {name ?? email ?? "Sesion activa"}
              </p>
              <p className="text-xs uppercase text-[#707973]">Rol {role}</p>
            </div>
          </div>

          <DocumentInventory inventory={inventory} />

          <Card className="rounded-lg border border-[#b7d2be] bg-[#eef6e9] shadow-none">
            <CardContent className="flex flex-col gap-3 pt-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-white/80 text-[#274f3d]">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <p className="font-semibold text-[#274f3d]">
                    Acceso administrativo verificado
                  </p>
                  <p className="text-sm text-[#566342]">
                    La ruta esta limitada a roles persistidos expert y admin.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

function RestrictedAdminState() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f4ec] px-6 text-[#1b1c17]">
      <Card className="w-full max-w-xl rounded-lg border border-[rgba(191,201,193,0.75)] bg-white/85 shadow-none">
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-lg bg-[#f4dfd8] text-[#8a3d2c]">
            <LockKeyhole className="size-5" />
          </div>
          <CardTitle>
            <h1 className="font-display text-3xl font-bold text-[#1b1c17]">
              Acceso restringido
            </h1>
          </CardTitle>
          <CardDescription className="leading-6">
            Tu usuario autenticado no tiene permisos para abrir el panel
            documental.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link
            className="botanical-focus inline-flex h-10 items-center justify-center rounded-lg bg-[#274f3d] px-4 text-sm font-semibold text-white transition hover:bg-[#1f4031]"
            href="/chat"
          >
            Volver al chat
          </Link>
          <SignOutForm
            buttonClassName="h-10 rounded-lg border border-[rgba(191,201,193,0.75)] bg-white px-4 text-sm text-[#566342] shadow-none hover:bg-[#f6f4ec]"
            label="Cerrar sesion"
          />
        </CardContent>
      </Card>
    </main>
  );
}

export default async function AdminKnowledgePage() {
  const appSession = await getOptionalAppSession();

  if (!appSession?.session.user) {
    redirect(buildRelativeSignInUrl("/admin/knowledge"));
  }

  const { user } = appSession.session;

  if (!canAccessDocumentaryAdmin(user.role)) {
    return <RestrictedAdminState />;
  }

  let inventory: DocumentInventoryState;

  try {
    inventory = {
      documents: await knowledgeDocumentCatalogStore.listDocuments({
        limit: ADMIN_KNOWLEDGE_DOCUMENT_LIMIT,
      }),
      status: "ready",
    };
  } catch {
    inventory = {
      status: "error",
    };
  }

  return (
    <AdminKnowledgeShell
      email={user.email ?? null}
      inventory={inventory}
      name={user.name ?? null}
      role={user.role}
    />
  );
}
