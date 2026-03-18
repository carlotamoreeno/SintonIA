import { LogOut } from "lucide-react";
import { signOutCurrentUser } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";

export function SignOutForm() {
  return (
    <form action={signOutCurrentUser}>
      <Button
        className="w-full sm:w-auto"
        size="lg"
        type="submit"
        variant="outline"
      >
        Cerrar sesion
        <LogOut />
      </Button>
    </form>
  );
}
