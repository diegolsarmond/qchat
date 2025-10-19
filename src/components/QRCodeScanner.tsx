import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Credential } from "@/types/whatsapp";

interface QRCodeScannerProps {
  credential: Credential;
  onConnected: () => void;
}

export const QRCodeScanner = ({ credential, onConnected }: QRCodeScannerProps) => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("Gerando QR Code...");

  useEffect(() => {
    // Simulating QR code generation
    const timer = setTimeout(() => {
      // In real implementation, this would fetch from UAZ API
      setQrCode("https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=WhatsAppDemo");
      setLoading(false);
      setStatus("Escaneie o QR Code com seu WhatsApp");
    }, 2000);

    return () => clearTimeout(timer);
  }, [credential]);

  const handleSimulateConnection = () => {
    setStatus("Conectando...");
    setLoading(true);
    setTimeout(() => {
      onConnected();
    }, 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-primary/5 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <QrCode className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Conectar ao WhatsApp</CardTitle>
          <CardDescription>
            Instância: {credential.instanceName}
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

            {!loading && (
              <div className="space-y-2 w-full">
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Abra o WhatsApp no seu celular</li>
                  <li>Toque em Configurações → Aparelhos conectados</li>
                  <li>Toque em Conectar aparelho</li>
                  <li>Aponte seu celular para esta tela</li>
                </ol>
                
                {/* Simulated button for demo */}
                <Button 
                  onClick={handleSimulateConnection} 
                  className="w-full mt-4"
                  variant="outline"
                >
                  Simular Conexão (Demo)
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
