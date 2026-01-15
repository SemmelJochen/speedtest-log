import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
    react(),
    viteTsConfigPaths(),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
  },
});
