import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import { themes as prismThemes } from 'prism-react-renderer';

/** Shared TypeDoc options: API pages are regenerated from the package source
 *  on every build, so the reference can never drift from the code. */
const typedocBase = {
  readme: 'none',
  indexFormat: 'table',
  parametersFormat: 'table',
  enumMembersFormat: 'table',
  useCodeBlocks: true,
  disableSources: true,
  hidePageHeader: true,
  hideBreadcrumbs: true,
  cleanOutputDir: true,
};

const config: Config = {
  title: 'use-everywhere',
  tagline: 'State and messages that exist in every tab, window, and worker',
  favicon: 'img/favicon.svg',

  url: 'https://rxova.github.io',
  baseUrl: '/use-everywhere/',
  organizationName: 'rxova',
  projectName: 'use-everywhere',
  trailingSlash: false,

  onBrokenLinks: 'warn',
  markdown: { hooks: { onBrokenMarkdownLinks: 'warn' } },

  i18n: { defaultLocale: 'en', locales: ['en'] },

  plugins: [
    [
      'docusaurus-plugin-typedoc',
      {
        ...typedocBase,
        id: 'api-core',
        entryPoints: ['../../packages/core/src/index.ts'],
        tsconfig: '../../packages/core/tsconfig.json',
        out: 'docs/api/core',
      },
    ],
    [
      'docusaurus-plugin-typedoc',
      {
        ...typedocBase,
        id: 'api-react',
        entryPoints: ['../../packages/react/src/index.ts'],
        tsconfig: '../../packages/react/tsconfig.json',
        out: 'docs/api/react',
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/rxova/use-everywhere/tree/main/apps/docs/',
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'use-everywhere( )',
      items: [
        { type: 'doc', docId: 'intro', position: 'left', label: 'Guides' },
        { to: '/api/core', position: 'left', label: 'Core API' },
        { to: '/api/react', position: 'left', label: 'React API' },
        { href: 'https://github.com/rxova/use-everywhere', position: 'right', label: 'GitHub' },
      ],
    },
    footer: {
      style: 'dark',
      copyright: 'Built with Docusaurus. API reference generated from source with TypeDoc.',
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
