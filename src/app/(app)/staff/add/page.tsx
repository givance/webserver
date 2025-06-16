"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useStaff } from "@/app/hooks/use-staff";
import { useWhatsApp } from "@/app/hooks/use-whatsapp";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Plus, X, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
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
  whatsappPhoneNumbers: z.array(z.string().min(10, "Phone number must be at least 10 digits")).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function AddStaffPage() {
  const { createStaff, isCreating } = useStaff();
  const { addPhoneNumber } = useWhatsApp();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>([]);

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
      whatsappPhoneNumbers: [],
    },
  });

  // Clear error when form values change
  useEffect(() => {
    const subscription = form.watch(() => {
      if (error) {
        setError(null);
      }
    });
    return () => subscription.unsubscribe();
  }, [form, error]);

  /**
   * Add a new phone number field
   */
  const addPhoneNumberField = () => {
    setPhoneNumbers([...phoneNumbers, ""]);
  };

  /**
   * Remove a phone number field
   */
  const removePhoneNumberField = (index: number) => {
    const newPhoneNumbers = phoneNumbers.filter((_, i) => i !== index);
    setPhoneNumbers(newPhoneNumbers);
    form.setValue(
      "whatsappPhoneNumbers",
      newPhoneNumbers.filter((phone) => phone.trim())
    );
  };

  /**
   * Update phone number at specific index
   */
  const updatePhoneNumber = (index: number, value: string) => {
    const newPhoneNumbers = [...phoneNumbers];
    newPhoneNumbers[index] = value;
    setPhoneNumbers(newPhoneNumbers);
    form.setValue(
      "whatsappPhoneNumbers",
      newPhoneNumbers.filter((phone) => phone.trim())
    );
  };

  /**
   * Handles form submission
   * Creates a new staff member and redirects to staff list on success
   * @param values Form values from the form submission
   */
  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      // First create the staff member
      const result = await createStaff({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        title: values.title,
        department: values.department,
        isRealPerson: values.isRealPerson,
      });

      if (result) {
        // If WhatsApp phone numbers were provided, add them
        if (values.whatsappPhoneNumbers && values.whatsappPhoneNumbers.length > 0) {
          try {
            for (const phoneNumber of values.whatsappPhoneNumbers) {
              if (phoneNumber.trim()) {
                await addPhoneNumber(result.id, phoneNumber.trim());
              }
            }
          } catch (phoneError: any) {
            console.warn("Error adding phone numbers, but staff was created:", phoneError);
            const phoneErrorMessage = phoneError?.message || "Unknown error adding phone numbers";
            toast.warning(
              `Staff member created successfully, but failed to add phone numbers: ${phoneErrorMessage}. You can add them later from the staff detail page.`
            );
          }
        }

        toast.success("Staff member created successfully");
        router.push("/staff");
      } else {
        // This case should rarely happen, but we need to handle it
        const errorMessage = "Failed to create staff member - no result returned from server";
        setError(errorMessage);
        toast.error(errorMessage);
        console.error("Staff creation failed: No result returned");
      }
    } catch (err: any) {
      console.error("Error creating staff:", err);

      // Extract meaningful error message from tRPC error structure
      let errorMessage = "An unexpected error occurred while creating staff member";

      // Log the full error structure for debugging
      console.error("Full error structure:", JSON.stringify(err, null, 2));

      // tRPC errors can come in different structures, check all possible locations
      if (err?.message) {
        errorMessage = err.message;
      } else if (err?.data?.message) {
        errorMessage = err.data.message;
      } else if (err?.error?.message) {
        errorMessage = err.error.message;
      } else if (err?.shape?.message) {
        errorMessage = err.shape.message;
      } else if (err?.cause?.message) {
        errorMessage = err.cause.message;
      } else if (typeof err === "string") {
        errorMessage = err;
      }

      // Remove "Error [TRPCError]: " prefix if present
      if (errorMessage.startsWith("Error [TRPCError]: ")) {
        errorMessage = errorMessage.replace("Error [TRPCError]: ", "");
      }

      setError(errorMessage);
      toast.error(errorMessage);
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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 mb-6 rounded-lg">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error Creating Staff Member</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

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

              {/* WhatsApp Phone Numbers Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <FormLabel className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      WhatsApp Phone Numbers
                    </FormLabel>
                    <FormDescription>
                      Add phone numbers that this staff member can receive WhatsApp messages on (optional)
                    </FormDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addPhoneNumberField}
                    className="flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Phone
                  </Button>
                </div>

                {phoneNumbers.map((phoneNumber, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      placeholder="+1 (555) 123-4567"
                      value={phoneNumber}
                      onChange={(e) => updatePhoneNumber(index, e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePhoneNumberField(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                {phoneNumbers.length === 0 && (
                  <div className="text-sm text-muted-foreground italic border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
                    No WhatsApp phone numbers added. Click "Add Phone" to enable WhatsApp functionality for this staff
                    member.
                  </div>
                )}
              </div>

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
                <Button type="submit" disabled={isCreating} className="min-w-[160px]">
                  {isCreating ? (
                    <>
                      <div className="animate-spin -ml-1 mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                      Creating...
                    </>
                  ) : (
                    "Create Staff Member"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </>
  );
}
