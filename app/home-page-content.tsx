import type { ReactNode } from "react";
import { CheckCircle2, LockKeyhole, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type HomePageUser = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
};

type HomePageContentProps = {
  user: HomePageUser | null;
  signInControl?: ReactNode;
  signOutControl?: ReactNode;
};

function getUserInitials(user: HomePageUser) {
  const source = user.name ?? user.email ?? user.id;

  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function HomePageContent({
  user,
  signInControl,
  signOutControl,
}: HomePageContentProps) {
  const statusLabel = user ? "Sesion activa" : "Acceso pendiente";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(214,188,250,0.35),_transparent_34%),linear-gradient(180deg,_#fffaf1_0%,_#f5f0e4_46%,_#ece6d8_100%)] text-zinc-950">
      <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.7),_transparent_72%)]" />
      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-10 px-6 py-16 sm:px-10 lg:flex-row lg:items-center lg:gap-16">
        <section className="max-w-2xl space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-zinc-900/10 bg-white/70 px-3 py-1 text-sm font-medium tracking-wide text-zinc-700 backdrop-blur">
            <Sparkles className="size-4" />
            MVP documentado para chat con conocimiento propio
          </p>
          <div className="space-y-4">
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              SintonIA prepara un acceso OAuth limpio antes de abrir el chat
              grounded.
            </h1>
            <p className="max-w-xl text-lg leading-8 text-zinc-700">
              Este primer ciclo deja la entrada con Google lista sobre Auth.js y
              cierra el contrato de datos que sostendra perfiles,
              conversaciones, consentimientos y roles del MVP.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-zinc-700 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-900/10 bg-white/65 p-4 shadow-sm backdrop-blur">
              <LockKeyhole className="mb-3 size-4" />
              Login/logout con Auth.js y estrategia `jwt`.
            </div>
            <div className="rounded-2xl border border-zinc-900/10 bg-white/65 p-4 shadow-sm backdrop-blur">
              <CheckCircle2 className="mb-3 size-4" />
              `proxy.ts` conserva `request_id` y mantiene la sesion viva.
            </div>
            <div className="rounded-2xl border border-zinc-900/10 bg-white/65 p-4 shadow-sm backdrop-blur">
              <Sparkles className="mb-3 size-4" />
              Esquema base cerrado para `users`, `profiles` y chat persistente.
            </div>
          </div>
        </section>

        <Card className="w-full max-w-xl border border-zinc-900/10 bg-white/80 shadow-[0_25px_80px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
          <CardHeader className="gap-3">
            <p className="text-xs font-semibold tracking-[0.18em] text-zinc-500 uppercase">
              {statusLabel}
            </p>
            <CardTitle className="text-2xl">Estado del acceso MVP</CardTitle>
            <CardDescription className="text-base leading-7">
              {user
                ? "La identidad autenticada ya expone un identificador estable derivado del subject de Google."
                : "Inicia sesion para probar el flujo OAuth y preparar el acceso a las rutas privadas del producto."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {user ? (
              <div className="flex items-start gap-4 rounded-2xl border border-zinc-900/10 bg-zinc-50/80 p-4">
                <Avatar size="lg">
                  <AvatarImage
                    alt={user.name ?? user.email ?? user.id}
                    src={user.image ?? undefined}
                  />
                  <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 space-y-1">
                  <p className="text-base font-medium text-zinc-950">
                    {user.name ?? "Usuario autenticado"}
                  </p>
                  <p className="truncate text-sm text-zinc-600">
                    {user.email ?? "Sin email publico"}
                  </p>
                  <p className="rounded-xl bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-50">
                    {user.id}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-900/15 bg-zinc-50/70 p-5 text-sm leading-7 text-zinc-700">
                El proveedor inicial del MVP es Google. La sesion se mantendra
                con `jwt` mientras el esquema relacional queda listo para
                persistir perfiles, conversaciones y roles en tareas
                posteriores.
              </div>
            )}
            <div className="grid gap-3 text-sm text-zinc-700">
              <div className="flex items-start gap-3 rounded-2xl bg-zinc-100/70 px-4 py-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-zinc-950" />
                <span>Provider inicial cerrado: Google sobre Auth.js.</span>
              </div>
              <div className="flex items-start gap-3 rounded-2xl bg-zinc-100/70 px-4 py-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-zinc-950" />
                <span>
                  Identidad app-facing: `provider:subject`, lista para enlazar
                  con `users`.
                </span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-zinc-600">
              {user
                ? "El siguiente paso es proteger rutas privadas y persistir el perfil autenticado."
                : "El flujo visual ya esta listo para conectar las credenciales reales del entorno."}
            </p>
            <div className="w-full sm:w-auto">
              {user ? signOutControl : signInControl}
            </div>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
