"use client";

import { Donation } from "./columns";
import Link from "next/link";
import { X } from "lucide-react";

interface ClientDonationTableProps {
  columns: unknown[];
  data: Donation[];
  donorFilter?: string;
  donorName?: string;
  projectFilter?: string;
  projectName?: string;
}

export function ClientDonationTable({
  columns,
  data,
  donorFilter,
  donorName,
  projectFilter,
  projectName,
}: ClientDonationTableProps) {
  return (
    <div className="space-y-4">
      {/* Display active filters */}
      {(donorFilter || projectFilter) && (
        <div className="flex items-center gap-2 text-sm mb-2">
          <span className="font-medium">Active filters:</span>
          {donorFilter && (
            <div className="flex items-center gap-1 bg-blue-50 text-blue-800 px-2 py-1 rounded-md">
              <span>Donor: {donorName || donorFilter}</span>
              <Link href="/donations" className="hover:text-blue-600">
                <X className="h-4 w-4" />
              </Link>
            </div>
          )}
          {projectFilter && (
            <div className="flex items-center gap-1 bg-green-50 text-green-800 px-2 py-1 rounded-md">
              <span>Project: {projectName || projectFilter}</span>
              <Link href="/donations" className="hover:text-green-600">
                <X className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
      )}

      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left">Donor</th>
              <th className="px-4 py-2 text-left">Amount</th>
              <th className="px-4 py-2 text-left">Project</th>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-4">
                  No donations found
                </td>
              </tr>
            ) : (
              data.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2">
                    {!donorFilter ? (
                      <Link href={`/donations?donor=${item.donorId}`} className="text-blue-600 hover:underline">
                        {item.donorName}
                      </Link>
                    ) : (
                      item.donorName
                    )}
                  </td>
                  <td className="px-4 py-2">${item.amount.toFixed(2)}</td>
                  <td className="px-4 py-2">
                    {!projectFilter ? (
                      <Link href={`/donations?project=${item.projectId}`} className="text-blue-600 hover:underline">
                        {item.projectName}
                      </Link>
                    ) : (
                      item.projectName
                    )}
                  </td>
                  <td className="px-4 py-2">{new Date(item.date).toLocaleDateString()}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                        ${
                          item.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : item.status === "pending"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}
                    >
                      {item.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <a href={`/donations/${item.id}/edit`} className="text-blue-600 hover:underline">
                      Edit
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
