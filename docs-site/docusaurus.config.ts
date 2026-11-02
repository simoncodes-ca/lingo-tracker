import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';

const config: Config = {
  title: 'LingoTracker',
  tagline: 'Translation management that lives in your repository',
  favicon: 'img/favicon.png',

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
          exclude: ['**/adr/**'],
          editUrl: ({ docPath }) => `https://github.com/simoncodes-ca/lingo-tracker/edit/develop/docs/${docPath}`,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'LingoTracker',
      logo: {
        alt: 'LingoTracker Logo',
        src: 'img/logo.png',
        srcDark: 'img/logo-dark.png',
      },
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
            { label: 'Concepts', to: '/docs/concepts' },
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
