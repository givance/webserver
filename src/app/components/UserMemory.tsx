"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface UserMemoryProps {
  initialMemory: string[];
  onAddMemory: (memory: string) => Promise<void>;
  onUpdateMemory: (index: number, newMemory: string) => Promise<void>;
  onDeleteMemory: (index: number) => Promise<void>;
}

export function UserMemory({ initialMemory, onAddMemory, onUpdateMemory, onDeleteMemory }: UserMemoryProps) {
  const [memory, setMemory] = useState<string[]>(initialMemory);
  const [newMemory, setNewMemory] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleAddMemory = async () => {
    if (!newMemory.trim()) return;
    try {
      await onAddMemory(newMemory);
      setMemory([...memory, newMemory]);
      setNewMemory("");
      toast.success("Memory added successfully");
    } catch (error) {
      toast.error("Failed to add memory. Please try again.");
    }
  };

  const handleUpdateMemory = async (index: number) => {
    if (!editValue.trim()) return;
    try {
      await onUpdateMemory(index, editValue);
      const newMemoryArray = [...memory];
      newMemoryArray[index] = editValue;
      setMemory(newMemoryArray);
      setEditingIndex(null);
      setEditValue("");
      toast.success("Memory updated successfully");
    } catch (error) {
      toast.error("Failed to update memory. Please try again.");
    }
  };

  const handleDeleteMemory = async (index: number) => {
    try {
      await onDeleteMemory(index);
      const newMemoryArray = memory.filter((_, i) => i !== index);
      setMemory(newMemoryArray);
      toast.success("Memory deleted successfully");
    } catch (error) {
      toast.error("Failed to delete memory. Please try again.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Memory</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Add new memory */}
          <div className="flex gap-2">
            <Input
              placeholder="Add a new memory..."
              value={newMemory}
              onChange={(e) => setNewMemory(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleAddMemory()}
            />
            <Button onClick={handleAddMemory}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Memory list */}
          <div className="space-y-2">
            {memory.map((item, index) => (
              <div key={index} className="flex items-center gap-2 group">
                {editingIndex === index ? (
                  <>
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && handleUpdateMemory(index)}
                      autoFocus
                    />
                    <Button onClick={() => handleUpdateMemory(index)}>Save</Button>
                    <Button variant="ghost" onClick={() => setEditingIndex(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1">{item}</div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingIndex(index);
                        setEditValue(item);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteMemory(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
