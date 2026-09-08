import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hire Trusted Handymen",
  description: "Find, review, and hire verified local handymen for your property maintenance. Post jobs, receive bids, and get work done securely with EasyRent.",
  keywords: ["hire handyman", "local plumbers", "electricians", "property maintenance", "home repair", "contractor bidding"],
  openGraph: {
    title: "Hire Trusted Handymen | EasyRent",
    description: "Find, review, and hire verified local handymen for your property maintenance.",
    url: 'https://easyrent.com/handyman',
  }
};

export default function HandymanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
