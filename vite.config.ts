import { defineConfig } from 'vite';

// `vite` serves the examples, with the data from public/data. `vite build`
// bundles the library
export default defineConfig({
    build: {
        lib: {
            entry: 'src/index.ts',
            formats: ['es'],
            fileName: 'stranded',
        },
        copyPublicDir: false,
    },
});
