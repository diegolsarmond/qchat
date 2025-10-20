import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CredentialSetupProps {
  onSetupComplete: (credentialId: string) => void;
}

export const CredentialSetup = ({ onSetupComplete }: CredentialSetupProps) => {
  const [instanceName, setInstanceName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [token, setToken] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let active = true;

    const loadUserCredentials = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        return;
      }

      if (active) {
        setUserId(data.user.id);
      }

      const { data: existing } = await supabase
        .from('credentials')
        .select('id')
        .eq('user_id', data.user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (active && existing && existing.length > 0) {
        onSetupComplete(existing[0].id);
      }
    };

    loadUserCredentials();

    return () => {
      active = false;
    };
  }, [onSetupComplete]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!instanceName || !subdomain || !token) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      let currentUserId = userId;
      if (!currentUserId) {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data?.user) {
          throw error || new Error('Usuário não autenticado');
        }
        currentUserId = data.user.id;
        setUserId(currentUserId);
      }

      // Insert credential into database
      const { data, error } = await supabase
        .from('credentials')
        .insert({
          instance_name: instanceName,
          subdomain: subdomain,
          token: token,
          admin_token: adminToken || null,
          status: 'disconnected',
          user_id: currentUserId,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Credenciais salvas com sucesso!",
      });

      onSetupComplete(data.id);
    } catch (error) {
      console.error('Error saving credentials:', error);
      toast({
        title: "Erro",
        description: "Falha ao salvar credenciais",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-primary/5 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageSquare className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Configurar WhatsApp</CardTitle>
          <CardDescription>
            Configure suas credenciais para conectar ao WhatsApp via UAZ API
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="instanceName">Nome da Instância</Label>
              <Input
                id="instanceName"
                placeholder="Minha Instância"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="subdomain">Subdomínio UAZ</Label>
              <Input
                id="subdomain"
                placeholder="quantumtecnologia"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Exemplo: se sua URL é quantumtecnologia.uazapi.com, use "quantumtecnologia"
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="token">Token da Instância</Label>
              <Input
                id="token"
                type="password"
                placeholder="Seu token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adminToken">Admin Token (Opcional)</Label>
              <Input
                id="adminToken"
                type="password"
                placeholder="Token de administrador"
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Salvando..." : "Conectar WhatsApp"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
