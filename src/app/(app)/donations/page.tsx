import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { columns, Donation } from "./columns";
import { Skeleton } from "@/components/ui/skeleton";
import { listDonations, DonationWithDetails } from "@/app/lib/data/donations";
import { ClientDonationTable } from "./ClientDonationTable";

interface SearchParams {
  donor?: string;
  project?: string;
}

export default async function DonationListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const context = params.donor ? `for donor ${params.donor}` : params.project ? `for project ${params.project}` : "all";

  try {
    const donationsData = await listDonations({
      donorId: params.donor ? parseInt(params.donor) : undefined,
      projectId: params.project ? parseInt(params.project) : undefined,
      includeDonor: true,
      includeProject: true,
    });

    // Get donor name for filter display
    const firstDonation = donationsData.find((d) => params.donor && d.donorId.toString() === params.donor);
    const donorName = firstDonation?.donor
      ? `${firstDonation.donor.firstName} ${firstDonation.donor.lastName}`.trim()
      : undefined;

    // Get project name for filter display
    const projectDonation = donationsData.find((d) => params.project && d.projectId.toString() === params.project);
    const projectName = projectDonation?.project?.name;

    // Transform DonationWithDetails to Donation format
    const donations: Donation[] = donationsData.map((item): Donation => {
      return {
        id: item.id.toString(),
        amount: item.amount,
        donorId: item.donorId.toString(),
        donorName: `${item.donor?.firstName || ""} ${item.donor?.lastName || ""}`.trim() || "Unknown Donor",
        projectId: item.projectId.toString(),
        projectName: item.project?.name || "Unknown Project",
        type: "one_time",
        status: "completed",
        date: item.date.toISOString(),
        notes: undefined,
      };
    });

    return (
      <>
        <title>Donation Management</title>
        <div className="container mx-auto py-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Donations {context}</h1>
            <Link
              href={`/donations/add${
                params.donor ? `?donor=${params.donor}` : params.project ? `?project=${params.project}` : ""
              }`}
            >
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Donation
              </Button>
            </Link>
          </div>

          <ClientDonationTable
            columns={columns}
            data={donations || []}
            donorFilter={params.donor}
            donorName={donorName}
            projectFilter={params.project}
            projectName={projectName}
          />
        </div>
      </>
    );
  } catch (error) {
    return (
      <>
        <title>Donation Management - Error</title>
        <div className="container mx-auto py-6">
          <div className="text-red-500">Error loading donations: {(error as Error).message}</div>
        </div>
      </>
    );
  }
}
