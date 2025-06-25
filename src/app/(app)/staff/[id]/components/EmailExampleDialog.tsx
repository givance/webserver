"use client";

import { Button } from "@/components/ui/button";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useEffect } from "react";

const emailExampleFormSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  content: z.string().min(1, "Content is required"),
  category: z.enum([
    "donor_outreach",
    "thank_you",
    "follow_up",
    "general",
    "fundraising",
    "event_invitation",
    "update",
  ]).optional(),
});

type EmailExampleFormValues = z.infer<typeof emailExampleFormSchema>;

interface EmailExampleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  example?: {
    id: number;
    subject: string;
    content: string;
    category: string | null;
  } | null;
  onSubmit: (data: EmailExampleFormValues) => Promise<void>;
  isSubmitting: boolean;
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
  isSubmitting,
}: EmailExampleDialogProps) {
  const form = useForm<EmailExampleFormValues>({
    resolver: zodResolver(emailExampleFormSchema),
    defaultValues: {
      subject: "",
      content: "",
      category: "general",
    },
  });

  // Reset form when dialog opens with an example
  useEffect(() => {
    if (open && example) {
      form.reset({
        subject: example.subject,
        content: example.content,
        category: example.category as EmailExampleFormValues["category"] || "general",
      });
    } else if (open && !example) {
      form.reset({
        subject: "",
        content: "",
        category: "general",
      });
    }
  }, [open, example, form]);

  const handleSubmit = async (data: EmailExampleFormValues) => {
    await onSubmit(data);
    onOpenChange(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {example ? "Edit Email Example" : "Add Email Example"}
          </DialogTitle>
          <DialogDescription>
            Provide an example email that represents your writing style. This will be used as a reference when generating personalized emails.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject Line</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., Thank you for your generous support" 
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    The subject line of your email example
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
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
                  <FormDescription>
                    Categorize this email example for better organization
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Content</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Dear [Donor Name],

I hope this message finds you well. I wanted to personally reach out to thank you for your continued support..."
                      className="min-h-[200px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Write the full email content. You can use placeholders like [Donor Name], [Project Name], etc.
                  </FormDescription>
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
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : example ? "Update Example" : "Add Example"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}