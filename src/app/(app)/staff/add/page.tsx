"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useStaff } from "@/app/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { type CheckedState } from "@radix-ui/react-checkbox";

/**
 * Form schema for staff creation
 * Defines validation rules for each field
 */
const formSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  title: z.string().optional(),
  department: z.string().optional(),
  signature: z.string().optional(),
  isRealPerson: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

export default function AddStaffPage() {
  const { createStaff, isCreating } = useStaff();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    // @ts-ignore - Known type mismatch with zodResolver and react-hook-form
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      title: "",
      department: "",
      signature: "",
      isRealPerson: true,
    },
  });

  /**
   * Handles form submission
   * Creates a new staff member and redirects to staff list on success
   * @param values Form values from the form submission
   */
  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const result = await createStaff(values);
      if (result) {
        toast.success("Staff member created successfully");
        router.push("/staff");
      } else {
        setError("Failed to create staff member");
        toast.error("Failed to create staff member");
      }
    } catch (err: any) {
      const message = err.message || "An unexpected error occurred";
      setError(message);
      toast.error(message);
      console.error("Error creating staff:", err);
    }
  };

  return (
    <>
      <title>Add New Staff Member</title>
      <div className="container mx-auto py-6">
        <div className="flex items-center mb-6">
          <Link href="/staff" className="mr-4">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Add New Staff Member</h1>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 mb-4 rounded">{error}</div>}

        <div className="bg-white p-6 shadow rounded-lg max-w-2xl">
          <Form {...form}>
            <form
              // @ts-ignore - Known type mismatch with react-hook-form, but works as expected
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6"
            >
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  // @ts-ignore - Known type mismatch with react-hook-form's Control type
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  // @ts-ignore - Known type mismatch with react-hook-form's Control type
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                // @ts-ignore - Known type mismatch with react-hook-form's Control type
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="john.doe@example.com" {...field} />
                    </FormControl>
                    <FormDescription>Enter the staff member&apos;s email address</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                // @ts-ignore - Known type mismatch with react-hook-form's Control type
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Marketing Manager" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormDescription>Enter the staff member&apos;s job title</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                // @ts-ignore - Known type mismatch with react-hook-form's Control type
                control={form.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <FormControl>
                      <Input placeholder="Marketing" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormDescription>Enter the staff member&apos;s department</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                // @ts-ignore - Known type mismatch with react-hook-form's Control type
                control={form.control}
                name="signature"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Signature</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Best regards,&#10;John Doe&#10;Marketing Manager&#10;example@nonprofit.org"
                        {...field}
                        value={field.value || ""}
                        rows={4}
                        className="resize-none"
                      />
                    </FormControl>
                    <FormDescription>Enter the staff member&apos;s email signature (optional)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                // @ts-ignore - Known type mismatch with react-hook-form's Control type
                control={form.control}
                name="isRealPerson"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked: CheckedState) => {
                          field.onChange(checked === true);
                        }}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Real Person</FormLabel>
                      <FormDescription>Is this a real person or a system account?</FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <div className="flex justify-end">
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? "Creating..." : "Create Staff Member"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </>
  );
}
