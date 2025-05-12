import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { columns } from "./columns";
import { Skeleton } from "@/components/ui/skeleton";
import { listDonations } from "@/app/lib/data/donations";
import { ClientDonationTable } from "./ClientDonationTable";

interface SearchParams {
  donor?: string;
  project?: string;
}

export default async function DonationListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const context = params.donor ? `for donor ${params.donor}` : params.project ? `for project ${params.project}` : "all";

  try {
    const donations = await listDonations({
      donorId: params.donor ? parseInt(params.donor) : undefined,
      projectId: params.project ? parseInt(params.project) : undefined,
      includeDonor: true,
      includeProject: true,
    });

    return (
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

        <ClientDonationTable columns={columns} data={donations || []} />
      </div>
    );
  } catch (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-red-500">Error loading donations: {(error as Error).message}</div>
      </div>
    );
  }
}
