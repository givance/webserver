import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Brain, User, Building2, X } from "lucide-react";
import { useMemory } from "@/app/hooks/use-memory";
import { useOrganization } from "@/app/hooks/use-organization";
import { toast } from "sonner";
import { useState } from "react";

interface SuggestedMemoriesProps {
  memories: string[];
}

export function SuggestedMemories({ memories: initialMemories }: SuggestedMemoriesProps) {
  const { addMemoryItem: addPersonalMemory, dismissMemoryItem } = useMemory();
  const { addMemoryItem: addOrganizationalMemory } = useOrganization();
  const [memories, setMemories] = useState(initialMemories);

  if (!memories?.length) return null;

  const handleSavePersonal = async (memory: string) => {
    try {
      await addPersonalMemory(memory);
      setMemories(memories.filter((m) => m !== memory));
      toast.success("Added to personal memories");
    } catch (error) {
      toast.error("Failed to add to personal memories");
    }
  };

  const handleSaveOrganizational = async (memory: string) => {
    try {
      await addOrganizationalMemory(memory);
      setMemories(memories.filter((m) => m !== memory));
      toast.success("Added to organizational memories");
    } catch (error) {
      toast.error("Failed to add to organizational memories");
    }
  };

  const handleDismiss = async (memory: string) => {
    try {
      await dismissMemoryItem(memory);
      setMemories(memories.filter((m) => m !== memory));
      toast.success("Memory dismissed");
    } catch (error) {
      toast.error("Failed to dismiss memory");
    }
  };

  return (
    <Card className="p-4 bg-muted/30">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="h-4 w-4" />
        <h4 className="text-sm font-medium">Suggested Memories</h4>
      </div>
      <div className="space-y-3">
        {memories.map((memory, index) => (
          <div key={index} className="flex items-start gap-3 p-3 bg-background rounded-lg">
            <p className="flex-1 text-sm">{memory}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex items-center gap-1"
                onClick={() => handleSavePersonal(memory)}
              >
                <User className="h-3 w-3" />
                <span className="text-xs">Personal</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex items-center gap-1"
                onClick={() => handleSaveOrganizational(memory)}
              >
                <Building2 className="h-3 w-3" />
                <span className="text-xs">Org</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex items-center gap-1 text-destructive hover:text-destructive"
                onClick={() => handleDismiss(memory)}
              >
                <X className="h-3 w-3" />
                <span className="text-xs">Dismiss</span>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
