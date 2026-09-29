import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Everything from Sleeper is untrusted: never inject raw HTML.
      "react/no-danger": "error",
    },
  },
  {
    ignores: [".next/", "out/", "next-env.d.ts", "public/", "test-results/", "playwright-report/"],
  },
];

export default config;
