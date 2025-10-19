import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface QRCodeScannerProps {
  credentialId: string;
  onConnected: () => void;
}


export const QRCodeScanner = ({ credentialId, onConnected }: QRCodeScannerProps) => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("Conectando ao WhatsApp...");
  const [instanceName, setInstanceName] = useState<string>("");
  const { toast } = useToast();

  const fetchQRCode = async () => {
    try {
      setLoading(true);
      setStatus("Buscando QR Code...");

      const { data, error } = await supabase.functions.invoke('uaz-get-qr', {
        body: { credentialId }
      });

      if (error) throw error;

      console.log('QR Code response:', data);

      if (data.connected) {
        setStatus("Conectado!");
        setTimeout(() => onConnected(), 1500);
      } else if (data.qrCode) {
        setQrCode(data.qrCode);
        setLoading(false);
        setStatus("Escaneie o QR Code com seu WhatsApp");
      } else if (data.status === 'connecting') {
        setLoading(true);
        setStatus("Aguardando QR Code...");
        // Retry after 2 seconds
        setTimeout(fetchQRCode, 2000);
      } else {
        setLoading(false);
        setStatus("Erro ao gerar QR Code");
        toast({
          title: "Erro",
          description: "Não foi possível gerar o QR Code",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error fetching QR code:', error);
      setLoading(false);
      setStatus("Erro ao conectar");
      toast({
        title: "Erro",
        description: "Falha ao buscar QR Code",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    // Fetch credential info
    const fetchCredential = async () => {
      const { data } = await supabase
        .from('credentials')
        .select('instance_name')
        .eq('id', credentialId)
        .single();
      
      if (data) {
        setInstanceName(data.instance_name);
      }
    };

    fetchCredential();
    fetchQRCode();

    // Poll for connection status every 3 seconds
    const interval = setInterval(fetchQRCode, 3000);

    return () => clearInterval(interval);
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
