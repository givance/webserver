"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useProjects } from "@/app/hooks/use-projects";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { SubmitHandler } from "react-hook-form";

/**
 * Form schema for project creation
 * Defines validation rules for each field
 */
const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  active: z.boolean(),
  goal: z.number().optional(),
  tags: z.array(z.string()),
});

// Define the form values type using zod inference
type FormValues = z.infer<typeof formSchema>;

export default function AddProjectPage() {
  const { createProject, isCreating } = useProjects();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    // @ts-ignore - Known type mismatch with zodResolver and react-hook-form
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      startDate: undefined,
      endDate: undefined,
      active: true,
      goal: undefined,
      tags: [],
    },
  });

  /**
   * Handles form submission
   * Creates a new project and redirects to project list on success
   * @param values Form values from the form submission
   */
  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    setError(null);
    try {
      // Ensure organizationId is added by the API
      const result = await createProject({
        ...values,
        goal: values.goal || 0,
        organizationId: "", // This will be set by the API
      });

      if (result) {
        toast.success("Project created successfully");
        router.push("/projects");
      } else {
        setError("Failed to create project");
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error("Error creating project:", err);
    }
  };

  return (
    <>
      <title>Add New Project</title>
      <div className="container mx-auto py-6">
        <div className="flex items-center mb-6">
          <Link href="/projects" className="mr-4">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Add New Project</h1>
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
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Annual Fundraiser 2023" {...field} />
                    </FormControl>
                    <FormDescription>Enter a descriptive name for the project</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                // @ts-ignore - Known type mismatch with react-hook-form's Control type
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Details about this project..."
                        className="min-h-[120px]"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormDescription>Provide a detailed description of the project</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  // @ts-ignore - Known type mismatch with react-hook-form's Control type
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Start Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                            >
                              {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  // @ts-ignore - Known type mismatch with react-hook-form's Control type
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>End Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                            >
                              {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                // @ts-ignore - Known type mismatch with react-hook-form's Control type
                control={form.control}
                name="goal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fundraising Goal</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="5000"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>Enter the fundraising goal amount (if applicable)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                // @ts-ignore - Known type mismatch with react-hook-form's Control type
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Active Project</FormLabel>
                      <FormDescription>Is this project currently active?</FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <div className="flex justify-end">
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? "Creating..." : "Create Project"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </>
  );
}
