import { useCallback } from "react";
import { Link, useMatches } from "@tanstack/react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Home } from "lucide-react";

export const Breadcrumbs = () => {
  const matches = useMatches();

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {matches
          .filter((match) => match.routeId !== "__root__")
          .map((match, index) => {
            const isLast = index === matches.length - 2;
            const routeId = match.routeId;

            // Special case for the home route
            if (routeId === "/") {
              return (
                <BreadcrumbItem key={routeId}>
                  {isLast ? (
                    <BreadcrumbPage>Home</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link to="/">
                        <Home className="h-4 w-4" />
                      </Link>
                    </BreadcrumbLink>
                  )}
                  {!isLast && <BreadcrumbSeparator />}
                </BreadcrumbItem>
              );
            }

            // Extract a human-readable title from the routeId.
            // Example: '/layout/products/$productId' -> 'Products' or 'Product ID'
            const pathSegments = routeId.split("/").filter(Boolean);
            let title = pathSegments[pathSegments.length - 1];
            console.log(match.loaderData?.crumb)

            // If the segment is a dynamic parameter, get the value from the params.
            if (title.startsWith("$")) {
              title = match.loaderData?.crumb || "Item";
            } else {
              // Capitalize the first letter for a cleaner title.
              title = title.charAt(0).toUpperCase() + title.slice(1);
            }
            // return null;
            // Default breadcrumb item for other routes.
            console.log(title)
            return (
              <BreadcrumbItem key={routeId}>
                {isLast ? <BreadcrumbPage>{title}</BreadcrumbPage> : null}
                
                {!isLast && <BreadcrumbSeparator />}
              </BreadcrumbItem>
            );
          })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};
