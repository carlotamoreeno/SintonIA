import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="min-h-screen bg-[#fbf9f1] text-[#1b1c17] lg:h-screen">
      <div className="flex min-h-screen lg:h-screen">
        <aside className="hidden h-screen w-72 shrink-0 border-r border-[rgba(191,201,193,0.2)] bg-[#f0eee6] p-6 lg:flex">
          <div className="flex w-full flex-col gap-6">
            <Skeleton className="h-8 w-40 rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <div className="space-y-3 pt-4">
              <Skeleton className="h-4 w-28 rounded-full" />
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-8 w-5/6 rounded-lg" />
            </div>
          </div>
        </aside>

        <div className="flex flex-1 flex-col">
          <section className="flex-1 bg-white px-4 py-10 sm:px-6 lg:px-12 lg:py-16">
            <div className="mx-auto flex w-full max-w-[56rem] flex-col gap-6">
              <Skeleton className="h-32 w-full rounded-[2rem]" />
              <Skeleton className="h-24 w-3/4 rounded-[1.5rem]" />
              <Skeleton className="h-24 w-2/3 self-end rounded-[1.5rem]" />
              <Skeleton className="h-28 w-4/5 rounded-[1.5rem]" />
            </div>
          </section>

          <footer className="border-t border-[rgba(191,201,193,0.2)] bg-white/95 px-4 py-4 sm:px-6 lg:px-12">
            <div className="mx-auto w-full max-w-[56rem]">
              <Skeleton className="h-28 w-full rounded-[1.5rem]" />
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
