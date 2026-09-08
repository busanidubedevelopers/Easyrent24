import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ConditionalLayoutWrapper } from "@/components/ConditionalLayoutWrapper";
import { WhatsAppButton } from "@/components/WhatsAppButton";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://easyrent.com'),
  title: {
    default: "EasyRent | The Modern Rental Marketplace",
    template: "%s | EasyRent",
  },
  description: "EasyRent is the premier platform connecting landlords, tenants, and handymen. Verified credit reports, seamless applications, and reliable property maintenance in one place.",
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
    description: "EasyRent is the premier platform connecting landlords, tenants, and handymen. Verified credit reports, seamless applications, and reliable property maintenance.",
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
        "description": "The modern rental marketplace connecting landlords, tenants, and handymen with verified credit reports and seamless applications.",
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
        className={`${inter.variable} antialiased min-h-screen flex flex-col bg-background text-foreground font-sans`}
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
