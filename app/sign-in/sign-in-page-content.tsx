import Link from "next/link";
import Image from "next/image";
import { SintoniaMark } from "@/components/brand/sintonia-mark";
import { SintoniaWordmark } from "@/components/brand/sintonia-wordmark";
import { GoogleSignInForm } from "@/components/auth/google-sign-in-form";

type SignInPageContentProps = {
  callbackUrl: string;
};

export function SignInPageContent({ callbackUrl }: SignInPageContentProps) {
  return (
    <main className="min-h-screen bg-[linear-gradient(90deg,#fbf9f1_0%,#fbf9f1_100%)]">
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="relative flex flex-col bg-white">
          <div className="flex items-center justify-between px-6 py-8 sm:px-8">
            <Link
              aria-label="Ir al inicio de SintonIA"
              className="botanical-focus rounded-md"
              href="/"
            >
              <SintoniaWordmark />
            </Link>

            <div className="hidden items-center gap-6 sm:flex">
              <span
                aria-disabled="true"
                className="botanical-placeholder inline-flex items-center gap-2 font-display text-sm font-semibold"
              >
                <SintoniaMark className="size-4" size={16} />
                About
              </span>
              <span
                aria-disabled="true"
                className="botanical-placeholder inline-flex items-center gap-2 font-display text-sm font-semibold"
              >
                <Image
                  alt=""
                  aria-hidden="true"
                  height={16}
                  src="/ui/icons/alert.svg"
                  width={16}
                />
                Support
              </span>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center px-6 pb-12 pt-8 sm:px-8">
            <div className="w-full max-w-[26.25rem]">
              <div className="space-y-2">
                <h1 className="font-display text-[2.25rem] font-extrabold leading-10 tracking-[-0.025em] text-[#274f3d]">
                  Bienvenido
                </h1>
                <p className="text-base font-medium leading-6 text-[#566342]">
                  Accede a tu laboratorio botanico personal
                </p>
              </div>

              <GoogleSignInForm
                buttonClassName="mt-10 h-[3.25rem] rounded-lg border border-[rgba(191,201,193,0.2)] bg-[#e4e2db] px-6 text-sm font-semibold text-[#1b1c17] shadow-none hover:bg-[#dcd9d0]"
                callbackUrl={callbackUrl}
                label="Google"
              />

              <p className="mt-6 text-sm font-medium leading-5 text-[#566342]">
                ¿No tienes cuenta?{" "}
                <span className="font-semibold text-[#274f3d]">
                  Registrate ahora
                </span>
              </p>
            </div>
          </div>
        </section>

        <section className="relative hidden min-h-screen lg:block">
          <Image
            alt="Hojas botanicas iluminadas dramaticamente sobre fondo oscuro"
            className="absolute inset-0 h-full w-full object-cover"
            fill
            sizes="50vw"
            src="/figma/sign-in-botanical.png"
          />
          <div className="absolute inset-0 bg-[rgba(39,79,61,0.1)] mix-blend-multiply" />

          <div className="absolute inset-x-12 bottom-12 rounded-xl border border-white/20 bg-black/20 p-8 backdrop-blur-[6px]">
            <p className="max-w-[39.375rem] font-display text-lg font-semibold leading-7 text-white">
              &quot;La inteligencia al servicio de la naturaleza, para
              reconectar con lo esencial.&quot;
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
