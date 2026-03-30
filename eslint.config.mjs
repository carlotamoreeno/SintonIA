import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    ignores: ["lib/openai/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "openai",
              message:
                "Fuera de lib/openai/** use @/lib/openai/adapter como unica frontera con OpenAI.",
            },
            {
              name: "@/lib/openai/client",
              message:
                "Fuera de lib/openai/** use @/lib/openai/adapter en lugar del cliente interno.",
            },
          ],
          patterns: [
            {
              group: ["**/lib/openai/client"],
              message:
                "Fuera de lib/openai/** use @/lib/openai/adapter en lugar del cliente interno.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value='openai']",
          message:
            "Fuera de lib/openai/** use @/lib/openai/adapter como unica frontera con OpenAI.",
        },
        {
          selector: "ImportExpression[source.value='@/lib/openai/client']",
          message:
            "Fuera de lib/openai/** use @/lib/openai/adapter en lugar del cliente interno.",
        },
        {
          selector: "ImportExpression[source.value=/lib\\/openai\\/client$/]",
          message:
            "Fuera de lib/openai/** use @/lib/openai/adapter en lugar del cliente interno.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
