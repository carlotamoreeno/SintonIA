import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BookOpenCheck,
  BookOpenText,
  CalendarClock,
  Leaf,
  ScanSearch,
  Sprout,
} from "lucide-react";
import { SintoniaWordmark } from "@/components/brand/sintonia-wordmark";

export type HomePageUser = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
};

type HomePageContentProps = {
  signOutControl?: ReactNode;
  user: HomePageUser | null;
};

const benefits = [
  {
    body: "Resolucion inmediata de problemas. Identifica carencias nutricionales o plagas en segundos con nuestro motor de analisis.",
    cardClassName: "bg-[#f6f4ec] text-[#274f3d]",
    cta: "Explorar funcion",
    icon: ScanSearch,
    iconWrapClassName: "bg-[#274f3d] text-white",
    title: "Dudas rapidas",
  },
  {
    body: "Cada planta es unica. Generamos calendarios de riego, abonado y trasplante adaptados a tu microclima local.",
    cardClassName: "bg-[#3f6754] text-white",
    cta: "Configurar perfil",
    icon: CalendarClock,
    iconWrapClassName: "bg-[#c1ecd4] text-[#274f3d]",
    title: "Cuidados a medida",
  },
  {
    body: "Biblioteca botanica curada por expertos. Informacion tecnica presentada de forma clara y aplicable a tu hogar.",
    cardClassName: "bg-[#e4e2db] text-[#274f3d]",
    cta: "Ver biblioteca",
    icon: BookOpenText,
    iconWrapClassName: "bg-[#703800] text-white",
    title: "Acceso directo al conocimiento",
  },
] as const;

const methodologyHighlights = [
  {
    body: "Fuentes academicas procesadas para el aficionado moderno.",
    icon: BookOpenCheck,
    title: "Base de datos rigurosa",
  },
  {
    body: "Visualiza el crecimiento y la salud de tu coleccion a traves del tiempo.",
    icon: Sprout,
    title: "Seguimiento evolutivo",
  },
] as const;

function MarketingHeader({
  isAuthenticated,
  signOutControl,
}: {
  isAuthenticated: boolean;
  signOutControl?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-[rgba(191,201,193,0.3)] bg-[rgba(251,249,241,0.8)] backdrop-blur-xl">
      <div className="mx-auto flex h-20 w-full max-w-[1400px] items-center justify-between gap-6 px-6 sm:px-8">
        <Link
          aria-label="Ir al inicio de SintonIA"
          className="botanical-focus rounded-md"
          href="/"
        >
          <SintoniaWordmark />
        </Link>

        <nav
          aria-label="Secciones principales"
          className="hidden items-center gap-12 lg:flex"
        >
          <Link
            className="botanical-focus border-b-2 border-[#274f3d] pb-0.5 font-display text-base font-semibold tracking-[-0.025em] text-[#274f3d]"
            href="#about"
          >
            About
          </Link>
          <Link
            className="botanical-focus font-display text-base font-semibold tracking-[-0.025em] text-[#566342] transition hover:text-[#274f3d]"
            href="#methodology"
          >
            Methodology
          </Link>
          <Link
            className="botanical-focus font-display text-base font-semibold tracking-[-0.025em] text-[#566342] transition hover:text-[#274f3d]"
            href="#support"
          >
            Support
          </Link>
        </nav>

        {isAuthenticated ? (
          <div className="flex items-center gap-3">
            <Link
              className="botanical-focus hidden rounded-lg bg-[#274f3d] px-6 py-3 font-display text-sm font-bold tracking-[0.025em] text-white shadow-[0_10px_15px_-3px_rgba(39,79,61,0.15),0_4px_6px_-4px_rgba(39,79,61,0.15)] transition hover:bg-[#1f4031] sm:inline-flex"
              href="/chat"
            >
              Abrir chat
            </Link>
            {signOutControl}
          </div>
        ) : (
          <Link
            className="botanical-focus inline-flex rounded-lg bg-[#274f3d] px-6 py-3 font-display text-sm font-bold tracking-[0.025em] text-white shadow-[0_10px_15px_-3px_rgba(39,79,61,0.15),0_4px_6px_-4px_rgba(39,79,61,0.15)] transition hover:bg-[#1f4031]"
            href="/sign-in"
          >
            Get Started
          </Link>
        )}
      </div>
    </header>
  );
}

function BenefitCard({
  body,
  cardClassName,
  cta,
  icon: Icon,
  iconWrapClassName,
  title,
}: (typeof benefits)[number]) {
  return (
    <article
      className={`flex h-full flex-col rounded-[2rem] p-10 ${cardClassName}`}
    >
      <div
        className={`mb-8 flex size-16 items-center justify-center rounded-2xl ${iconWrapClassName}`}
      >
        <Icon className="size-6" />
      </div>
      <h3 className="font-display text-2xl font-bold leading-8">{title}</h3>
      <p className="mt-4 flex-1 text-base leading-[1.625rem] opacity-80">
        {body}
      </p>
      <span className="mt-8 inline-flex items-center gap-2 font-semibold">
        {cta}
        <ArrowRight className="size-4" />
      </span>
    </article>
  );
}

export function HomePageContent({
  signOutControl,
  user,
}: HomePageContentProps) {
  const isAuthenticated = Boolean(user);
  const primaryHref = isAuthenticated ? "/chat" : "/sign-in";
  const primaryLabel = isAuthenticated ? "Abrir chat" : "Empieza gratis";

  return (
    <div className="min-h-screen text-[#1b1c17]">
      <MarketingHeader
        isAuthenticated={isAuthenticated}
        signOutControl={signOutControl}
      />

      <main className="overflow-hidden">
        <section
          className="relative overflow-hidden px-6 pb-24 pt-10 sm:px-8 lg:pb-40 lg:pt-12"
          id="about"
        >
          <div className="absolute inset-y-0 right-0 hidden w-[60%] rounded-bl-[10rem] bg-[#f6f4ec] lg:block" />

          <div className="relative mx-auto grid w-full max-w-[1400px] items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(420px,469px)]">
            <div className="max-w-[42.75rem]">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#d7e5bb] px-4 py-2 text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-[#5a6745]">
                <Leaf className="size-3.5" />
                Inteligencia Botanica
              </span>

              <h1 className="mt-8 max-w-[42rem] font-display text-5xl font-extrabold leading-none tracking-[-0.055em] text-[#274f3d] sm:text-6xl lg:text-[4.5rem] lg:leading-[4.5rem]">
                Entiende tus plantas,{" "}
                <span className="font-normal text-[#566342]">sintoniza</span>{" "}
                con la naturaleza.
              </h1>

              <p className="mt-8 max-w-[41rem] text-lg leading-7 text-[#404943] lg:text-xl lg:leading-7">
                Una herramienta agil para entusiastas de las plantas que
                simplifica el acceso a la informacion botanica. Cultiva con
                confianza y rigor cientifico.
              </p>

              <div className="mt-12 flex flex-col gap-4 sm:flex-row">
                <Link
                  className="botanical-focus inline-flex items-center justify-center rounded-xl bg-[#274f3d] px-10 py-5 font-display text-lg font-bold text-white shadow-[0_20px_25px_-5px_rgba(39,79,61,0.1),0_8px_10px_-6px_rgba(39,79,61,0.1)] transition hover:bg-[#1f4031]"
                  href={primaryHref}
                >
                  {primaryLabel}
                </Link>
                <Link
                  className="botanical-focus inline-flex items-center justify-center rounded-xl bg-[#e4e2db] px-10 py-5 font-display text-lg font-bold text-[#274f3d] transition hover:bg-[#dad7cf]"
                  href="#methodology"
                >
                  Saber mas
                </Link>
              </div>
            </div>

            <div className="relative flex justify-center lg:justify-end">
              <div className="relative h-[25rem] w-full max-w-[29.333rem] overflow-hidden rounded-[2.5rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] sm:h-[32rem] lg:h-[36.667rem]">
                <Image
                  alt="Salon con varias plantas de interior y mobiliario en tonos botanicos"
                  className="absolute inset-0 h-full w-full scale-[1.08] object-cover"
                  fill
                  sizes="(min-width: 1024px) 469px, 100vw"
                  src="/figma/landing-hero-room.png"
                />
              </div>

              <div className="botanical-glass absolute -bottom-10 left-0 max-w-[17.5rem] rounded-2xl p-8 sm:-left-8">
                <div className="flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-full bg-[#c1ecd4]">
                    <Image
                      alt=""
                      aria-hidden="true"
                      className="size-5"
                      height={20}
                      src="/figma/botanical-leaf.svg"
                      unoptimized
                      width={20}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[-0.05em] text-[#566342]">
                      Analisis IA
                    </p>
                    <p className="text-sm font-semibold text-[#274f3d]">
                      Salud Optima
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="h-2 rounded-full bg-[#eae8e0]">
                    <div className="h-full w-[85%] rounded-full bg-[#274f3d]" />
                  </div>
                  <p className="mt-2 text-[0.625rem] leading-[0.9375rem] text-[#404943]">
                    Monitoreando 12 especies activas
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-24 sm:px-8">
          <div className="mx-auto w-full max-w-[1400px]">
            <div className="mx-auto max-w-[42rem] text-center">
              <h2 className="font-display text-[2.25rem] font-extrabold leading-10 tracking-[-0.025em] text-[#274f3d]">
                Cuidado experto al alcance de tu mano
              </h2>
              <p className="mx-auto mt-4 max-w-[31rem] text-base leading-6 text-[#404943]">
                Tecnologia disenada para que la botanica sea accesible, precisa
                y gratificante.
              </p>
            </div>

            <div className="mt-16 grid gap-8 xl:grid-cols-3">
              {benefits.map((benefit) => (
                <BenefitCard key={benefit.title} {...benefit} />
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-24 sm:px-8" id="methodology">
          <div className="mx-auto grid w-full max-w-[1400px] items-center gap-16 lg:grid-cols-[minmax(0,568px)_minmax(0,568px)]">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="overflow-hidden rounded-2xl shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)]">
                <Image
                  alt="Primer plano de hojas verdes con textura marcada"
                  className="h-80 w-full object-cover"
                  height={320}
                  src="/figma/landing-leaves-closeup.png"
                  width={276}
                />
              </div>
              <div className="pt-12">
                <div className="overflow-hidden rounded-2xl shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)]">
                  <Image
                    alt="Maceta iluminada por el sol sobre una superficie de madera"
                    className="h-64 w-full object-cover"
                    height={256}
                    src="/figma/landing-potted-plant.png"
                    width={276}
                  />
                </div>
              </div>
            </div>

            <div>
              <h2 className="font-display text-[2.25rem] font-extrabold leading-10 tracking-[-0.025em] text-[#274f3d]">
                Ciencia y tecnologia en armonia.
              </h2>

              <div className="mt-10 space-y-8">
                {methodologyHighlights.map(({ body, icon: Icon, title }) => (
                  <div className="flex gap-6" key={title}>
                    <Icon className="mt-1 size-6 shrink-0 text-[#274f3d]" />
                    <div>
                      <h3 className="font-display text-xl font-bold leading-7 text-[#274f3d]">
                        {title}
                      </h3>
                      <p className="mt-2 text-base leading-6 text-[#404943]">
                        {body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <Link
                className="botanical-focus mt-10 inline-flex border-b-2 border-[#274f3d] pb-1 font-display text-base font-extrabold text-[#274f3d]"
                href="#support"
              >
                Conoce nuestra metodologia
              </Link>
            </div>
          </div>
        </section>

        <section
          className="bg-[#274f3d] px-6 py-24 text-white sm:px-8"
          id="support"
        >
          <div className="mx-auto flex w-full max-w-[56rem] flex-col items-center text-center">
            <h2 className="max-w-[50.5rem] font-display text-[3rem] font-extrabold leading-[3rem] tracking-[-0.03em]">
              ¿Listo para transformar tu espacio verde?
            </h2>
            <p className="mt-8 max-w-[37.75rem] text-xl leading-7 text-[#b8e4cc]">
              Unete a miles de entusiastas que ya estan sintonizando con sus
              plantas de manera profesional.
            </p>
            <Link
              className="botanical-focus mt-12 inline-flex items-center justify-center rounded-2xl bg-[#fbf9f1] px-12 py-6 font-display text-xl font-extrabold text-[#274f3d] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] transition hover:bg-white"
              href={primaryHref}
            >
              {isAuthenticated
                ? "Seguir en mi chat"
                : "Crear mi cuenta gratuita"}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[rgba(191,201,193,0.3)] bg-white px-6 py-16 sm:px-8">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <SintoniaWordmark />

          <div className="flex items-center gap-12">
            <span
              aria-disabled="true"
              className="botanical-placeholder text-sm font-semibold"
            >
              Instagram
            </span>
            <span
              aria-disabled="true"
              className="botanical-placeholder text-sm font-semibold"
            >
              Twitter
            </span>
            <span
              aria-disabled="true"
              className="botanical-placeholder text-sm font-semibold"
            >
              LinkedIn
            </span>
          </div>

          <p className="text-sm text-[#404943]">
            © 2024 SintonIA. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
