import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "List Your Property",
  description: "Find reliable, verified tenants quickly. EasyRent provides built-in credit checks, background screening, and streamlined application management for landlords.",
  keywords: ["list property", "landlord tools", "tenant screening", "property management software", "rent my house", "credit checks for tenants"],
  openGraph: {
    title: "List Your Property | EasyRent",
    description: "Find reliable, verified tenants quickly with built-in credit checks and screening.",
    url: 'https://easyrent.com/list-property',
  }
};

export default function ListPropertyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
