import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard/', '/applications/', '/credit-check/', '/checkout/', '/api/'],
    },
    sitemap: 'https://easyrent.com/sitemap.xml',
  };
}
