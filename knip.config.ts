import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: [],
      project: [],
    },
    'server': {
      project: ['src/**/*.ts'],
    },
    'client': {
      project: ['src/**/*.{ts,tsx}'],
    },
  },
  ignoreDependencies: ['better-sqlite3'],
};

export default config;
