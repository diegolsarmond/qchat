import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import { Credential } from "@/types/whatsapp";

interface CredentialSetupProps {
  onSetupComplete: (credential: Credential) => void;
}

export const CredentialSetup = ({ onSetupComplete }: CredentialSetupProps) => {
  const [instanceName, setInstanceName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [token, setToken] = useState("");
  const [adminToken, setAdminToken] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const credential: Credential = {
      id: crypto.randomUUID(),
      instanceName,
      subdomain,
      token,
      adminToken: adminToken || undefined,
      status: 'disconnected',
      createdAt: new Date(),
    };

    onSetupComplete(credential);
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
                placeholder="seu-subdominio"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Exemplo: se sua URL é demo.uazapi.com, use "demo"
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

            <Button type="submit" className="w-full">
              Conectar WhatsApp
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
