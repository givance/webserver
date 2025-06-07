"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { useTemplates } from "@/app/hooks/use-templates";

interface TemplateFormData {
  name: string;
  description: string;
  prompt: string;
  isActive: boolean;
}

interface TemplateDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  template?: any;
  onSave: (data: TemplateFormData) => Promise<void>;
  isLoading: boolean;
}

function TemplateDialog({ isOpen, onOpenChange, template, onSave, isLoading }: TemplateDialogProps) {
  const [formData, setFormData] = useState<TemplateFormData>({
    name: template?.name || "",
    description: template?.description || "",
    prompt: template?.prompt || "",
    isActive: template?.isActive ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.prompt.trim()) {
      toast.error("Name and prompt are required");
      return;
    }
    await onSave(formData);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      prompt: "",
      isActive: true,
    });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template ? "Edit Template" : "Create New Template"}</DialogTitle>
          <DialogDescription>
            {template ? "Update template details below." : "Create a reusable communication template."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter template name"
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this template"
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prompt">Prompt</Label>
            <Textarea
              id="prompt"
              value={formData.prompt}
              onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
              placeholder="Enter the communication prompt for this template..."
              rows={8}
              disabled={isLoading}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="isActive"
              checked={formData.isActive}
              onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              disabled={isLoading}
            />
            <Label htmlFor="isActive">Active</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : template ? "Update Template" : "Create Template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  template: any;
  onConfirm: () => Promise<void>;
  isLoading: boolean;
}

function DeleteDialog({ isOpen, onOpenChange, template, onConfirm, isLoading }: DeleteDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Template</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{template?.name}&quot;? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isLoading}>
            {isLoading ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TemplatesPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<any>(null);

  const {
    listTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    isCreatingTemplate,
    isUpdatingTemplate,
    isDeletingTemplate,
  } = useTemplates();

  const { data: templates, isLoading, error } = listTemplates({ includeInactive: true });

  const handleCreateTemplate = async (data: TemplateFormData) => {
    const result = await createTemplate(data);
    if (result) {
      toast.success("Template created successfully");
      setIsCreateDialogOpen(false);
    } else {
      toast.error("Failed to create template");
    }
  };

  const handleUpdateTemplate = async (data: TemplateFormData) => {
    if (!editingTemplate) return;
    const result = await updateTemplate({ ...data, id: editingTemplate.id });
    if (result) {
      toast.success("Template updated successfully");
      setEditingTemplate(null);
    } else {
      toast.error("Failed to update template");
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deletingTemplate) return;
    const result = await deleteTemplate(deletingTemplate.id);
    if (result) {
      toast.success("Template deleted successfully");
      setDeletingTemplate(null);
    } else {
      toast.error("Failed to delete template");
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-red-500">Error loading templates</div>
      </div>
    );
  }

  return (
    <>
      <title>Templates - Settings</title>
      <div className="container mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <FileText className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Templates</h1>
        </div>

        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-muted-foreground">Manage reusable communication prompts for your organization</p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Template
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              Templates ({templates?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {templates?.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <div className="text-muted-foreground mb-4">
                  No templates found. Create your first template to get started.
                </div>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Template
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates?.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">{template.name}</TableCell>
                      <TableCell>{template.description || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={template.isActive ? "default" : "secondary"}>
                          {template.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(template.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Button variant="outline" size="sm" onClick={() => setEditingTemplate(template)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setDeletingTemplate(template)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <TemplateDialog
          isOpen={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          onSave={handleCreateTemplate}
          isLoading={isCreatingTemplate}
        />

        <TemplateDialog
          isOpen={!!editingTemplate}
          onOpenChange={(open) => !open && setEditingTemplate(null)}
          template={editingTemplate}
          onSave={handleUpdateTemplate}
          isLoading={isUpdatingTemplate}
        />

        <DeleteDialog
          isOpen={!!deletingTemplate}
          onOpenChange={(open) => !open && setDeletingTemplate(null)}
          template={deletingTemplate}
          onConfirm={handleDeleteTemplate}
          isLoading={isDeletingTemplate}
        />
      </div>
    </>
  );
}
