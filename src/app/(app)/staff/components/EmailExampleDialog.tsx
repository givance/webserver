import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Save, X } from "lucide-react";

const emailExampleSchema = z.object({
  subject: z.string().min(1, "Subject is required").max(200, "Subject must be less than 200 characters"),
  content: z.string().min(10, "Content must be at least 10 characters").max(5000, "Content must be less than 5000 characters"),
  category: z.enum(["donor_outreach", "thank_you", "follow_up", "general", "fundraising", "event_invitation", "update"]).optional(),
});

type EmailExampleFormValues = z.infer<typeof emailExampleSchema>;

interface EmailExample {
  id: number;
  subject: string;
  content: string;
  category: string | null;
}

interface EmailExampleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  example?: EmailExample | null;
  onSubmit: (data: EmailExampleFormValues) => Promise<void>;
  isSubmitting?: boolean;
}

const categoryOptions = [
  { value: "donor_outreach", label: "Donor Outreach" },
  { value: "thank_you", label: "Thank You" },
  { value: "follow_up", label: "Follow Up" },
  { value: "general", label: "General" },
  { value: "fundraising", label: "Fundraising" },
  { value: "event_invitation", label: "Event Invitation" },
  { value: "update", label: "Update" },
];

export function EmailExampleDialog({
  open,
  onOpenChange,
  example,
  onSubmit,
  isSubmitting = false,
}: EmailExampleDialogProps) {
  const form = useForm<EmailExampleFormValues>({
    // @ts-ignore - Known type mismatch with zodResolver and react-hook-form
    resolver: zodResolver(emailExampleSchema),
    defaultValues: {
      subject: example?.subject || "",
      content: example?.content || "",
      category: (example?.category as EmailExampleFormValues["category"]) || "general",
    },
  });

  React.useEffect(() => {
    if (example) {
      form.reset({
        subject: example.subject,
        content: example.content,
        category: (example.category as EmailExampleFormValues["category"]) || "general",
      });
    } else {
      form.reset({
        subject: "",
        content: "",
        category: "general",
      });
    }
  }, [example, form]);

  const handleSubmit = async (data: EmailExampleFormValues) => {
    await onSubmit(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{example ? "Edit Email Example" : "Add Email Example"}</DialogTitle>
          <DialogDescription>
            {example
              ? "Update the email example that will be used as a reference for AI-generated emails."
              : "Add an email example that will be used as a reference for AI-generated emails."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            // @ts-ignore - Known type mismatch with react-hook-form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <FormField
              // @ts-ignore - Known type mismatch with react-hook-form's Control type
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject Line</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter the email subject line" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              // @ts-ignore - Known type mismatch with react-hook-form's Control type
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categoryOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              // @ts-ignore - Known type mismatch with react-hook-form's Control type
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Content</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Enter the email content..."
                      rows={10}
                      className="resize-none"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                <Save className="h-4 w-4 mr-2" />
                {isSubmitting ? "Saving..." : example ? "Update Example" : "Add Example"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}