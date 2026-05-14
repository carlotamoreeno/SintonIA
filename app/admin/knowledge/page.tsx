import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Archive,
  Database,
  FileUp,
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
import { SignOutForm } from "@/components/auth/sign-out-form";
import { buildRelativeSignInUrl } from "@/lib/auth/access";
import {
  canAccessDocumentaryAdmin,
  type DocumentaryAdminRole,
} from "@/lib/auth/admin-access";
import { getOptionalAppSession } from "@/lib/auth/app-session";

export const dynamic = "force-dynamic";

const adminModules = [
  {
    description: "En preparacion",
    icon: <Archive className="size-5" />,
    title: "Inventario documental",
  },
  {
    description: "En preparacion",
    icon: <FileUp className="size-5" />,
    title: "Subida documental",
  },
  {
    description: "En preparacion",
    icon: <Database className="size-5" />,
    title: "Operaciones de indice",
  },
] as const;

type AdminKnowledgeShellProps = {
  email: string | null;
  name: string | null;
  role: DocumentaryAdminRole;
};

function AdminKnowledgeShell({ email, name, role }: AdminKnowledgeShellProps) {
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
                Base protegida para operar el catalogo, la subida documental y
                los procesos de reindexado del MVP.
              </p>
            </div>
            <div className="rounded-xl border border-[rgba(191,201,193,0.75)] bg-white/75 px-4 py-3 text-sm text-[#404943]">
              <p className="font-semibold text-[#274f3d]">
                {name ?? email ?? "Sesion activa"}
              </p>
              <p className="text-xs uppercase text-[#707973]">Rol {role}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {adminModules.map((module) => (
              <Card
                className="rounded-lg border border-[rgba(191,201,193,0.55)] bg-white/80 shadow-none"
                key={module.title}
              >
                <CardHeader>
                  <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-[#dae8be] text-[#274f3d]">
                    {module.icon}
                  </div>
                  <CardTitle>{module.title}</CardTitle>
                  <CardDescription>{module.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>

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

  return (
    <AdminKnowledgeShell
      email={user.email ?? null}
      name={user.name ?? null}
      role={user.role}
    />
  );
}
