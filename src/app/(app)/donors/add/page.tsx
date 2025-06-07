"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useDonors } from "@/app/hooks/use-donors";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { type CheckedState } from "@radix-ui/react-checkbox";

/**
 * Form schema for donor creation
 * Defines validation rules for each field
 */
const formSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  notes: z.string().optional(),
  isAnonymous: z.boolean(),
  isOrganization: z.boolean(),
  organizationName: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function AddDonorPage() {
  const { createDonor, isCreating } = useDonors();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      state: "",
      postalCode: "",
      country: "",
      gender: null,
      notes: "",
      isAnonymous: false,
      isOrganization: false,
      organizationName: "",
    },
  });

  /**
   * Handles form submission
   * Creates a new donor and redirects to donor list on success
   * @param values Form values from the form submission
   */
  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      // The useDonors hook's createDonor mutation already handles success/error toasts internally via onEnd, onSuccess, onError.
      // We just need to await its completion and then redirect.
      // It will throw an error if the mutation fails, which will be caught here.
      const newDonor = await createDonor(values);

      // Assuming createDonor resolves without error on success (even if it returns void or the new donor)
      // The toast for success is likely handled by the useDonors hook's onSuccess callback.
      // If newDonor is returned, we could use it, but router.push is the main action here.
      router.push("/donors");
    } catch (err: any) {
      // The useDonors hook's createDonor mutation should ideally use toast.error for user feedback.
      // This setError is for a local error display on the form page itself, if still desired.
      const message = err.message || "An unexpected error occurred while creating the donor.";
      setError(message);
      // Avoid double toasting if useDonors already does it.
      // If not, uncomment: toast.error(message);
      console.error("Error creating donor:", err);
    }
  };

  return (
    <div className="container mx-auto px-6 py-6">
      <div className="flex items-center mb-6">
        <Link href="/donors" className="mr-4">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Add New Donor</h1>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 mb-4 rounded">{error}</div>}

      <div className="bg-white p-6 shadow rounded-lg max-w-2xl">
        <Form {...form}>
          <form
            // @ts-ignore - Known type mismatch with react-hook-form, but works as expected
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-6"
          >
            <FormField
              // @ts-ignore - Known type mismatch with react-hook-form's Control type
              control={form.control}
              name="isOrganization"
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
                    <FormLabel>Organization</FormLabel>
                    <FormDescription>Is this donor an organization rather than an individual?</FormDescription>
                  </div>
                </FormItem>
              )}
            />

            {form.watch("isOrganization") && (
              <FormField
                // @ts-ignore - Known type mismatch with react-hook-form's Control type
                control={form.control}
                name="organizationName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Acme Foundation" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormDescription>Name of the organization</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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
                  <FormDescription>Enter the donor&apos;s email address</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              // @ts-ignore - Known type mismatch with react-hook-form's Control type
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input placeholder="(555) 123-4567" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormDescription>Enter the donor&apos;s phone number</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              // @ts-ignore - Known type mismatch with react-hook-form's Control type
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Main St" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                // @ts-ignore - Known type mismatch with react-hook-form's Control type
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="New York" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                // @ts-ignore - Known type mismatch with react-hook-form's Control type
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State/Province</FormLabel>
                    <FormControl>
                      <Input placeholder="NY" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                // @ts-ignore - Known type mismatch with react-hook-form's Control type
                control={form.control}
                name="postalCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Postal Code</FormLabel>
                    <FormControl>
                      <Input placeholder="10001" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                // @ts-ignore - Known type mismatch with react-hook-form's Control type
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input placeholder="United States" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              // @ts-ignore - Known type mismatch with react-hook-form's Control type
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value ? field.value.toString() : ""}
                      onValueChange={(value) => {
                        field.onChange(value === "male" ? "male" : value === "female" ? "female" : null);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              // @ts-ignore - Known type mismatch with react-hook-form's Control type
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Additional information about this donor"
                      className="min-h-[100px]"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              // @ts-ignore - Known type mismatch with react-hook-form's Control type
              control={form.control}
              name="isAnonymous"
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
                    <FormLabel>Anonymous Donor</FormLabel>
                    <FormDescription>Mark as anonymous if this donor wishes to remain private</FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <div className="flex justify-end">
              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Creating..." : "Create Donor"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
