import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://akshaynarayanan.com",
  markdown: {
    shikiConfig: { theme: "github-light" },
  },
});
