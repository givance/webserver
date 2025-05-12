"use client";

import { Donation } from "./columns";

interface ClientDonationTableProps {
  columns: unknown[];
  data: Donation[];
}

export function ClientDonationTable({ columns, data }: ClientDonationTableProps) {
  return (
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
                <td className="px-4 py-2">{item.donorName}</td>
                <td className="px-4 py-2">${item.amount.toFixed(2)}</td>
                <td className="px-4 py-2">{item.projectName}</td>
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
  );
}
