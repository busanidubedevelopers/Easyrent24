"use client";

import { usePathname } from "next/navigation";

export function ConditionalLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hiddenRoutes = ["/signin", "/signup"];

  if (hiddenRoutes.includes(pathname)) {
    return null;
  }

  return <>{children}</>;
}
