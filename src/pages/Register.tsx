import { FormEvent, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type SignUp = typeof supabase.auth.signUp;

type PerformRegisterParams = {
  email: string;
  password: string;
  signUp: SignUp;
  toast: ReturnType<typeof useToast>['toast'];
  navigate: (path: string) => void;
  setLoading: (loading: boolean) => void;
};

const NETWORK_ERROR_MESSAGE = "Não foi possível conectar ao servidor de autenticação";

const resolveErrorMessage = (error: unknown): string => {
  if (typeof error === "object" && error !== null) {
    const hasMessage = "message" in error;
    const message = hasMessage ? (error as { message?: unknown }).message : undefined;
    const hasName = "name" in error;
    const name = hasName ? (error as { name?: unknown }).name : undefined;

    if (
      (typeof message === "string" && message.toLowerCase().includes("failed to fetch")) ||
      name === "TypeError"
    ) {
      return NETWORK_ERROR_MESSAGE;
    }

    if (typeof message === "string") {
      return message;
    }
  }

  if (typeof error === "string") {
    return error.toLowerCase().includes("failed to fetch") ? NETWORK_ERROR_MESSAGE : error;
  }

  return "Erro inesperado";
};

export const performRegister = async ({
  email,
  password,
  signUp,
  toast,
  navigate,
  setLoading,
}: PerformRegisterParams) => {
  setLoading(true);

  try {
    const { data, error } = await signUp({
      email,
      password,
    });

    if (error) {
      const message = resolveErrorMessage(error);
      toast({
        title: "Erro ao cadastrar",
        description: message,
        variant: "destructive",
      });
      return false;
    }

    const userId = data?.user?.id;
    const userEmail = data?.user?.email;

    if (!userId || !userEmail) {
      toast({
        title: "Erro ao cadastrar",
        description: "Erro inesperado",
        variant: "destructive",
      });
      return false;
    }

    const derivedName =
      (data?.user?.user_metadata as { name?: string } | undefined)?.name ??
      userEmail.split("@")[0];

    const { error: upsertError } = await supabase
      .from("users")
      .upsert(
        { id: userId, email: userEmail, name: derivedName },
        { onConflict: "id" },
      );

    if (upsertError) {
      const message = resolveErrorMessage(upsertError);
      toast({
        title: "Erro ao cadastrar",
        description: message,
        variant: "destructive",
      });
      return false;
    }

    toast({
      title: "Conta criada",
      description: "Cadastro realizado com sucesso",
    });

    navigate("/login");
    return true;
  } catch (unknownError) {
    const message = resolveErrorMessage(unknownError);
    toast({
      title: "Erro ao cadastrar",
      description: message,
      variant: "destructive",
    });
    return false;
  } finally {
    setLoading(false);
  }
};

const Register = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await performRegister({
      email,
      password,
      signUp: supabase.auth.signUp.bind(supabase.auth),
      toast,
      navigate,
      setLoading,
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-semibold">Criar conta</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? "Cadastrando..." : "Cadastrar"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <Link className="text-primary underline" to="/login">
              Já possui uma conta? Entrar
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Register;
