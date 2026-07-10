import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

function seoStaticFilesPlugin(siteUrl: string) {
  const normalized = siteUrl.replace(/\/$/, '');
  const publicRoutes = ['/', '/welcome', '/pricing'];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${publicRoutes
  .map(
    (route) => `  <url>
    <loc>${normalized}${route === '/' ? '' : route}</loc>
    <changefreq>${route === '/pricing' ? 'weekly' : 'weekly'}</changefreq>
    <priority>${route === '/' ? '1.0' : '0.9'}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  const robots = `User-agent: *
Allow: /
Allow: /pricing
Allow: /welcome

Disallow: /panel/
Disallow: /admin/
Disallow: /login
Disallow: /register
Disallow: /admin/login

Sitemap: ${normalized}/sitemap.xml
`;

  return {
    name: 'waai-seo-static-files',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = env.VITE_SITE_URL || 'https://waai.mekanizma.com';

  return {
    plugins: [react(), tailwindcss(), seoStaticFilesPlugin(siteUrl)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
