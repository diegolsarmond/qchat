import { FormEvent, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type SignInWithPassword = typeof supabase.auth.signInWithPassword;

type PerformLoginParams = {
  email: string;
  password: string;
  signInWithPassword: SignInWithPassword;
  toast: (options: { title: string; description: string; variant?: string }) => void;
  navigate: (path: string) => void;
  setLoading: (loading: boolean) => void;
};

export const performLogin = async ({
  email,
  password,
  signInWithPassword,
  toast,
  navigate,
  setLoading,
}: PerformLoginParams) => {
  setLoading(true);

  const { error } = await signInWithPassword({
    email,
    password,
  });

  setLoading(false);

  if (error) {
    toast({
      title: "Erro ao entrar",
      description: error.message,
      variant: "destructive",
    });
    return false;
  }

  toast({
    title: "Bem-vindo",
    description: "Login realizado com sucesso",
  });

  navigate("/");
  return true;
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await performLogin({
      email,
      password,
      signInWithPassword: supabase.auth.signInWithPassword,
      toast,
      navigate,
      setLoading,
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-semibold">Acessar conta</CardTitle>
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
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <Link className="text-primary underline" to="/register">
              Criar nova conta
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
