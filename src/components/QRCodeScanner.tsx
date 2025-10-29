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
  const { toast } = useToast();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetchingRef = useRef(false);
  const isActiveRef = useRef(true);

  const fetchQRCode = async () => {
    if (isFetchingRef.current || !isActiveRef.current) {
      return;
    }

    isFetchingRef.current = true;

    const ensurePolling = () => {
      if (isActiveRef.current && !intervalRef.current) {
        intervalRef.current = setInterval(() => {
          void fetchQRCode();
        }, 3000);
      }
    };

    try {
      setStatus("Verificando status da conexão...");

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const { data, error } = await supabase.functions.invoke('uaz-get-qr', {
        body: { credentialId },
        ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
      });

      if (error) {
        throw new Error(error.message);
      }

      type ConnectionResponse = {
        status?: string | null;
        qrCode?: string | null;
        profileName?: string | null;
        phoneNumber?: string | null;
        connected?: boolean;
        pairingCode?: string | null;
      } | null;

      const connectionData = (data ?? null) as ConnectionResponse;

      if (!isActiveRef.current) {
        return;
      }

      if (!connectionData) {
        setQrCode(null);
        setPairingCode("");
        setLoading(false);
        setStatus("Status desconhecido. Tente novamente.");
        onStatusChange?.(null);
        ensurePolling();
        return;
      }

      const normalizedStatus = connectionData.status ?? (connectionData.connected ? 'connected' : undefined);

      if (connectionData.connected) {
        setStatus("Já conectado!");
        setPairingCode("");
        setQrCode(null);
        setLoading(false);
        toast({
          title: "Conectado",
          description: `WhatsApp já conectado: ${connectionData.phoneNumber || 'número detectado'}`,
        });
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        onStatusChange?.('connected');
        setTimeout(() => onConnected(), 500);
        return;
      }

      if (connectionData.pairingCode) {
        setPairingCode(connectionData.pairingCode);
        setQrCode(null);
        setLoading(false);
        setStatus("Digite o código de pareamento no WhatsApp");
        onStatusChange?.(normalizedStatus ?? 'pairing');
        ensurePolling();
        return;
      }

      setPairingCode("");

      if (connectionData.qrCode) {
        setQrCode(connectionData.qrCode ?? null);
        setLoading(false);
        setStatus("Escaneie o QR Code com seu WhatsApp");
        onStatusChange?.(normalizedStatus ?? 'qrcode');
        ensurePolling();
        return;
      }

      if (normalizedStatus === 'connecting' || normalizedStatus === 'disconnected') {
        setQrCode(null);
        setPairingCode("");
        setLoading(true);
        setStatus("Gerando QR Code...");
        onStatusChange?.(normalizedStatus);
        ensurePolling();
        return;
      }

      // Caso não identificado
      setLoading(false);
      setStatus("Status desconhecido. Tente novamente.");
      onStatusChange?.(normalizedStatus ?? null);
      ensurePolling();

    } catch (error) {
      console.error('Error fetching connection status:', error);
      setLoading(false);
      setStatus("Erro ao verificar conexão");
      ensurePolling();
      toast({
        title: "Erro",
        description: "Falha ao verificar status da conexão",
        variant: "destructive",
      });
      onStatusChange?.('error');
      ensurePolling();
    }
    finally {
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    isActiveRef.current = true;

    const initialize = async () => {
      const statusPromise = fetchQRCode();

      const { data, error } = await supabase
        .from('credentials')
        .select('instance_name')
        .eq('id', credentialId)
        .single();

      if (!isActiveRef.current) {
        await statusPromise;
        return;
      }

      if (error || !data) {
        console.error('Erro ao carregar credencial:', error);
        setLoading(false);
        setStatus("Credencial não encontrada");
        onStatusChange?.('error');
        await statusPromise;
        return;
      }

      setInstanceName(data.instance_name);

      await statusPromise;
    };

    initialize();

    return () => {
      isActiveRef.current = false;
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
