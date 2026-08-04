import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://stellar-payment-gateway.dev';
  const lastModified = new Date();

  const staticRoutes = [
    { url: siteUrl, priority: 1.0 },
    { url: `${siteUrl}/wrap`, priority: 0.9 },
    { url: `${siteUrl}/assets`, priority: 0.8 },
    { url: `${siteUrl}/transactions`, priority: 0.8 },
    { url: `${siteUrl}/governance`, priority: 0.8 },
    { url: `${siteUrl}/analytics`, priority: 0.7 },
  ];

  return staticRoutes.map((route) => ({
    url: route.url,
    lastModified,
    changeFrequency: 'daily' as const,
    priority: route.priority,
  }));
}
