import { ArrowRight } from "lucide-react";
import { signInWithGoogle } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";

export function GoogleSignInForm() {
  return (
    <form action={signInWithGoogle}>
      <Button className="w-full sm:w-auto" size="lg" type="submit">
        Continuar con Google
        <ArrowRight />
      </Button>
    </form>
  );
}
