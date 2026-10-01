import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ConditionalLayoutWrapper } from "@/components/ConditionalLayoutWrapper";
import { WhatsAppButton } from "@/components/WhatsAppButton";

// Same typefaces as easyrent24.co.za: Inter for text, Playfair Display for headings.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://easyrent24.co.za'),
  title: {
    default: "Easy Rent 24 | Rental platform for South Africa",
    template: "%s | Easy Rent 24",
  },
  description: "EasyRent connects landlords, agents, tenants and handymen: tenant screening with affordability checks, online applications, digital leases and property maintenance in one place.",
  keywords: ["renting", "landlord", "tenant", "handyman", "credit check", "property management", "rental applications"],
  authors: [{ name: "EasyRent Team" }],
  creator: "EasyRent",
  publisher: "EasyRent",
  verification: {
    google: "placeholder-google-site-verification",
  },
  alternates: {
    canonical: "https://easyrent.com",
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    title: "EasyRent | The Modern Rental Marketplace",
    description: "EasyRent connects landlords, agents, tenants and handymen: tenant screening with affordability checks, online applications and digital leases.",
    url: 'https://easyrent.com',
    siteName: 'EasyRent',
    images: [
      {
        url: '/images/hero-apartment.png', // Assuming this exists as OG image
        width: 1200,
        height: 630,
        alt: 'EasyRent Dashboard Preview',
      }
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "EasyRent | The Modern Rental Marketplace",
    description: "Connect with verified tenants and trusted handymen instantly.",
    images: ['/images/hero-apartment.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "RealEstateAgent",
        "@id": "https://easyrent.com/#agent",
        "name": "EasyRent",
        "image": "https://easyrent.com/images/hero-apartment.png",
        "description": "A rental platform for South Africa connecting landlords, agents, tenants and handymen, with tenant due diligence, affordability checks and digital leases.",
        "url": "https://easyrent.com",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "New York",
          "addressRegion": "NY",
          "addressCountry": "US"
        },
        "sameAs": [
          "https://twitter.com/easyrent",
          "https://www.linkedin.com/company/easyrent"
        ]
      },
      {
        "@type": "Organization",
        "@id": "https://easyrent.com/#organization",
        "name": "EasyRent",
        "url": "https://easyrent.com",
        "logo": {
          "@type": "ImageObject",
          "url": "https://easyrent.com/images/logo-square.png",
          "width": 512,
          "height": 512
        },
        "publisher": {
          "@type": "Organization",
          "name": "EasyRent Press"
        }
      },
      {
        "@type": "WebSite",
        "@id": "https://easyrent.com/#website",
        "url": "https://easyrent.com",
        "name": "EasyRent",
        "publisher": {
          "@id": "https://easyrent.com/#organization"
        },
        "potentialAction": {
          "@type": "SearchAction",
          "target": "https://easyrent.com/find-home?q={search_term_string}",
          "query-input": "required name=search_term_string"
        }
      }
    ]
  };

  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${inter.variable} ${playfair.variable} antialiased min-h-screen flex flex-col bg-background text-foreground font-sans`}
        suppressHydrationWarning
      >
        <ConditionalLayoutWrapper>
          <Navbar />
        </ConditionalLayoutWrapper>
        <main className="flex-1">
          {children}
        </main>
        <ConditionalLayoutWrapper>
          <WhatsAppButton />
          <Footer />
        </ConditionalLayoutWrapper>
      </body>
    </html>
  );
}
