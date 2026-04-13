import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Lingo Tracker',
  tagline: 'Effortlessly Track, Validate, and Manage Your Translations',
  favicon: 'img/favicon.ico',

  url: 'https://simoncodes-ca.github.io',
  baseUrl: '/lingo-tracker/',

  organizationName: 'simoncodes-ca',
  projectName: 'lingo-tracker',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          path: '../docs',
          routeBasePath: 'docs',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/simoncodes-ca/lingo-tracker/edit/develop/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'Lingo Tracker',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/simoncodes-ca/lingo-tracker',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting Started', to: '/docs/getting-started' },
            { label: 'CLI Reference', to: '/docs/cli' },
            { label: 'API Reference', to: '/docs/api' },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/simoncodes-ca/lingo-tracker',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} SimonCodes. Built with Docusaurus.`,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
