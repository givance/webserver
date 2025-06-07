import { Button } from "@/components/ui/button";
import { Brain, User, Building2, X, Pencil } from "lucide-react";
import { useMemory } from "@/app/hooks/use-memory";
import { useOrganization } from "@/app/hooks/use-organization";
import { toast } from "sonner";
import { useState } from "react";
import { Input } from "@/components/ui/input";

interface SuggestedMemoriesProps {
  memories: string[];
}

export function SuggestedMemories({ memories: initialMemories }: SuggestedMemoriesProps) {
  const { addMemoryItem: addPersonalMemory, dismissMemoryItem } = useMemory();
  const { addMemoryItem: addOrganizationalMemory } = useOrganization();
  const [memories, setMemories] = useState(initialMemories);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

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

  const handleStartEdit = (index: number, memory: string) => {
    setEditingIndex(index);
    setEditValue(memory);
  };

  const handleSaveEdit = async (originalMemory: string) => {
    if (!editValue.trim()) return;

    const index = memories.indexOf(originalMemory);
    if (index === -1) return;

    const updatedMemories = [...memories];
    updatedMemories[index] = editValue;
    setMemories(updatedMemories);
    setEditingIndex(null);
    setEditValue("");
  };

  return (
    <div className="bg-muted/30 rounded-lg text-sm">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <Brain className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-muted-foreground">
          I noticed some interesting patterns. Would you like to save these memories?
        </span>
      </div>
      <div className="space-y-2 p-2">
        {memories.map((memory, index) => (
          <div
            key={index}
            className="flex items-center gap-2 bg-background/50 rounded p-2 group hover:bg-background/80 transition-colors"
          >
            {editingIndex === index ? (
              <div className="flex-1 flex gap-2">
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(memory)}
                  className="flex-1"
                  autoFocus
                />
                <Button size="sm" onClick={() => handleSaveEdit(memory)}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingIndex(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <p className="flex-1">{memory}</p>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleStartEdit(index, memory)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleSavePersonal(memory)}>
                    <User className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => handleSaveOrganizational(memory)}
                  >
                    <Building2 className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-destructive hover:text-destructive"
                    onClick={() => handleDismiss(memory)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
