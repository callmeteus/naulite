// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
    integrations: [
        starlight({
            title: 'Platform',
            description: 'Distributed orchestration platform documentation.',
            defaultLocale: 'root',
            locales: {
                root: {
                    label: 'English',
                    lang: 'en',
                },
            },
            sidebar: [
                {
                    label: 'Overview',
                    items: [
                        { label: 'Introduction', slug: 'index' },
                        { label: 'Alpha scope', slug: 'alpha-scope' },
                        { label: 'Dogfood README', slug: 'dogfood/readme' },
                    ],
                },
                {
                    label: 'Architecture',
                    items: [
                        { label: 'Architecture', slug: 'architecture' },
                        { label: 'Manifest reference', slug: 'manifest' },
                        { label: 'Networks', slug: 'networks' },
                        { label: 'NetBird', slug: 'netbird' },
                    ],
                },
                {
                    label: 'Get Started',
                    items: [
                        { label: 'Overview', slug: 'get-started' },
                        { label: 'Install', slug: 'get-started/install' },
                        { label: 'TLS modes', slug: 'get-started/tls' },
                        { label: 'Database', slug: 'get-started/database' },
                        { label: 'First workload', slug: 'get-started/first-workload' },
                    ],
                },
                {
                    label: 'Operations',
                    items: [{ autogenerate: { directory: 'operations' } }],
                },
                {
                    label: 'Guides',
                    items: [
                        { label: 'Manifest examples', slug: 'guides/manifest-examples' },
                        { label: 'Bootstrap', slug: 'bootstrap' },
                        { label: 'Backups', slug: 'backups' },
                        { label: 'Log rotation', slug: 'log-rotation' },
                        { label: 'Admin authentication', slug: 'admin-auth' },
                        { label: 'Continuous integration', slug: 'ci' },
                        { label: 'Release', slug: 'release' },
                    ],
                },
                {
                    label: 'Development',
                    items: [
                        { label: 'Zig code guidelines', slug: 'zig-guidelines' },
                    ],
                },
            ],
        }),
    ],
});
