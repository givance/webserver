import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function PageBreadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-gray-600">
      <Link href="/" className="hover:text-gray-900">
        Home
      </Link>
      {segments.map((segment, index) => (
        <span key={segment} className="flex items-center gap-2">
          <ChevronRight className="w-4 h-4" />
          <Link href={`/${segments.slice(0, index + 1).join("/")}`} className="capitalize hover:text-gray-900">
            {segment}
          </Link>
        </span>
      ))}
    </div>
  );
}
