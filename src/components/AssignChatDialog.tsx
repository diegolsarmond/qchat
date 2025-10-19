import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User } from "@/types/whatsapp";
import { useToast } from "@/hooks/use-toast";

interface AssignChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatName: string;
  users: User[];
  onAssign: (userId: string) => void;
}

export const AssignChatDialog = ({
  open,
  onOpenChange,
  chatName,
  users,
  onAssign,
}: AssignChatDialogProps) => {
  const [selectedUser, setSelectedUser] = useState<string>("");
  const { toast } = useToast();

  const handleAssign = () => {
    if (!selectedUser) {
      toast({
        title: "Selecione um usuário",
        description: "Por favor, selecione um usuário para atribuir a conversa.",
        variant: "destructive",
      });
      return;
    }

    onAssign(selectedUser);
    toast({
      title: "Conversa atribuída",
      description: `A conversa foi atribuída com sucesso.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atribuir Conversa</DialogTitle>
          <DialogDescription>
            Atribuir a conversa com {chatName} para um usuário
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="user">Selecionar Usuário</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger id="user">
                <SelectValue placeholder="Escolha um usuário" />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleAssign}>
            Atribuir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
