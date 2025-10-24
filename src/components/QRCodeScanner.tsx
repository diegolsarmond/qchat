import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface QRCodeScannerProps {
  credentialId: string;
  onConnected: () => void;
  onStatusChange?: (status?: string | null) => void;
}


export const QRCodeScanner = ({ credentialId, onConnected, onStatusChange }: QRCodeScannerProps) => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("Conectando ao WhatsApp...");
  const [instanceName, setInstanceName] = useState<string>("");
  const [pairingCode, setPairingCode] = useState<string>("");
  const [uazSubdomain, setUazSubdomain] = useState<string>("");
  const [uazToken, setUazToken] = useState<string>("");
  const { toast } = useToast();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetchingRef = useRef(false);

  const fetchQRCode = async (
    credentialData?: { subdomain: string; token: string }
  ) => {
    if (isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;

    try {
      setStatus("Verificando status da conexão...");

      const subdomain = credentialData?.subdomain || uazSubdomain;
      const token = credentialData?.token || uazToken;

      if (!subdomain || !token) {
        setLoading(true);
        setStatus("Carregando credenciais...");
        return;
      }

      const response = await fetch(`https://${subdomain}.uazapi.com/instance/status`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          token,
        },
      });

      if (!response.ok) {
        throw new Error(`UAZ API respondeu com status ${response.status}`);
      }

      const responseText = await response.text();
      type InstanceData = {
        status?: { connected?: boolean } | string | null;
        instance?: {
          status?: string | null;
          qrcode?: string | null;
          profileName?: string | null;
          owner?: string | null;
          paircode?: string | null;
        } | null;
      };

      let instanceData: InstanceData = {};

      if (responseText) {
        try {
          instanceData = JSON.parse(responseText) as InstanceData;
        } catch (parseError) {
          throw new Error('Resposta inválida da UAZ API');
        }
      }

      console.log('Status da instância:', instanceData);

      const connected =
        (typeof instanceData.status === 'object' && instanceData.status?.connected === true) ||
        instanceData.instance?.status === 'connected' ||
        instanceData.status === 'connected';

      const instanceStatus =
        typeof instanceData.instance?.status === 'string'
          ? instanceData.instance.status
          : typeof instanceData.status === 'string'
            ? instanceData.status
            : connected
              ? 'connected'
              : 'disconnected';

      onStatusChange?.(connected ? 'connected' : instanceStatus);

      const updateData: Record<string, any> = {
        status: instanceStatus || 'disconnected',
        updated_at: new Date().toISOString(),
      };

      if (instanceData.instance?.qrcode) {
        updateData.qr_code = instanceData.instance.qrcode;
      }

      if (instanceData.instance?.profileName) {
        updateData.profile_name = instanceData.instance.profileName;
      }

      if (instanceData.instance?.owner) {
        updateData.phone_number = instanceData.instance.owner;
      }

      const { error: updateError } = await supabase
        .from('credentials')
        .update(updateData)
        .eq('id', credentialId);

      if (updateError) {
        console.error('Erro ao atualizar credencial:', updateError);
      }

      if (connected) {
        setStatus("Já conectado!");
        setPairingCode("");
        setLoading(false);
        toast({
          title: "Conectado",
          description: `WhatsApp já conectado: ${instanceData.instance?.owner || 'número detectado'}`,
        });
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setTimeout(() => onConnected(), 500);
        return;
      }

      if (instanceData.instance?.paircode) {
        setPairingCode(instanceData.instance.paircode);
        setQrCode(null);
        setLoading(false);
        setStatus("Digite o código de pareamento no WhatsApp");
        return;
      }

      setPairingCode("");

      if (instanceData.instance?.qrcode) {
        setQrCode(instanceData.instance.qrcode ?? null);
        setLoading(false);
        setStatus("Escaneie o QR Code com seu WhatsApp");
        return;
      }

      if (instanceStatus === 'connecting' || instanceStatus === 'disconnected') {
        setQrCode(null);
        setPairingCode("");
        setLoading(true);
        setStatus("Gerando QR Code...");
        return;
      }

      // Caso não identificado
      setLoading(false);
      setStatus("Status desconhecido. Tente novamente.");

    } catch (error) {
      console.error('Error fetching connection status:', error);
      setLoading(false);
      setStatus("Erro ao verificar conexão");
      toast({
        title: "Erro",
        description: "Falha ao verificar status da conexão",
        variant: "destructive",
      });
      onStatusChange?.('error');
    }
    finally {
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    let isActive = true;

    const fetchCredential = async () => {
      const { data, error } = await supabase
        .from('credentials')
        .select('instance_name, subdomain, token')
        .eq('id', credentialId)
        .single();

      if (!isActive) {
        return;
      }

      if (error || !data) {
        console.error('Erro ao carregar credencial:', error);
        setLoading(false);
        setStatus("Credencial não encontrada");
        onStatusChange?.('error');
        return;
      }

      setInstanceName(data.instance_name);
      setUazSubdomain(data.subdomain);
      setUazToken(data.token);

      await fetchQRCode({ subdomain: data.subdomain, token: data.token });

      if (!isActive) {
        return;
      }

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      intervalRef.current = setInterval(() => {
        fetchQRCode({ subdomain: data.subdomain, token: data.token });
      }, 3000);
    };

    fetchCredential();

    return () => {
      isActive = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [credentialId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-primary/5 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <QrCode className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Conectar ao WhatsApp</CardTitle>
          <CardDescription>
            Instância: {instanceName}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            {loading ? (
              <div className="w-64 h-64 flex items-center justify-center bg-muted rounded-lg">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
              </div>
            ) : (
              <div className="w-64 h-64 bg-white p-4 rounded-lg shadow-md">
                <img 
                  src={qrCode || ""} 
                  alt="QR Code" 
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            
            <p className="text-sm text-center text-muted-foreground">
              {status}
            </p>

            {!loading && qrCode && (
              <div className="space-y-2 w-full">
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Abra o WhatsApp no seu celular</li>
                  <li>Toque em Configurações → Aparelhos conectados</li>
                  <li>Toque em Conectar aparelho</li>
                  <li>Aponte seu celular para esta tela</li>
                </ol>
              </div>
            )}

            {!loading && pairingCode && (
              <div className="space-y-3 w-full text-center">
                <div className="text-3xl font-semibold tracking-widest text-primary">
                  {pairingCode.split("").join(" ")}
                </div>
                <p className="text-xs text-muted-foreground">
                  Digite este código no seu WhatsApp para concluir a conexão
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
