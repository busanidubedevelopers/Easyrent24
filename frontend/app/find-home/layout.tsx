import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Find Your Next Home",
  description: "Browse rental listings. From cozy apartments to luxury homes, find the perfect property and apply instantly with your EasyRent profile.",
  keywords: ["apartments for rent", "rental homes", "verified listings", "tenant screening", "apartment search", "rent a house"],
  openGraph: {
    title: "Find Your Next Home | EasyRent",
    description: "Browse rental listings and apply online with your EasyRent profile.",
    url: 'https://easyrent.com/find-home',
  }
};

export default function FindHomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
