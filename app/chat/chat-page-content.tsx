import type { ReactNode } from "react";
import { LockKeyhole, MessageSquareText, ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AppRole } from "@/lib/auth/roles";

export type ChatPageUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: AppRole;
};

type ChatPageContentProps = {
  user: ChatPageUser;
  signOutControl?: ReactNode;
};

export function ChatPageContent({
  user,
  signOutControl,
}: ChatPageContentProps) {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f4efe6_0%,_#fbf7ef_52%,_#ffffff_100%)] px-6 py-16 text-zinc-950">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <section className="space-y-4">
          <p className="inline-flex items-center gap-2 rounded-full border border-zinc-900/10 bg-white px-3 py-1 text-sm font-medium text-zinc-700">
            <LockKeyhole className="size-4" />
            Ruta privada operativa
          </p>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">
              El acceso autenticado ya protege la futura experiencia de chat.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-zinc-700">
              Esta pantalla confirma el primer perimetro privado del MVP antes
              de integrar el orquestador de chat, la persistencia conversacional
              y el grounding documental.
            </p>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
          <Card className="border-zinc-900/10 bg-white/85 shadow-[0_24px_64px_-32px_rgba(15,23,42,0.35)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <MessageSquareText className="size-5" />
                Placeholder de chat autenticado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-7 text-zinc-700">
              <p>
                El flujo OAuth ya entrega identidad estable y rol app-facing. A
                partir de aqui, `T-33` a `T-42` podran conectar `/api/chat`,
                historial y citas sobre esta misma superficie protegida.
              </p>
              <div className="rounded-2xl border border-dashed border-zinc-900/15 bg-zinc-50 p-4">
                Proximo paso funcional: reemplazar este placeholder por la UI de
                conversacion completa sin reabrir la capa de autenticacion.
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-900/10 bg-white/85">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <ShieldCheck className="size-5" />
                Sesion actual
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-700">
              <div>
                <p className="font-medium text-zinc-950">Usuario</p>
                <p>{user.name ?? "Usuario autenticado"}</p>
              </div>
              <div>
                <p className="font-medium text-zinc-950">Email</p>
                <p>{user.email ?? "Sin email publico"}</p>
              </div>
              <div>
                <p className="font-medium text-zinc-950">Role</p>
                <p className="font-mono text-xs uppercase">{user.role}</p>
              </div>
              <div>
                <p className="font-medium text-zinc-950">App user id</p>
                <p className="break-all rounded-xl bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-50">
                  {user.id}
                </p>
              </div>
            </CardContent>
            <CardFooter>{signOutControl}</CardFooter>
          </Card>
        </div>
      </div>
    </main>
  );
}
