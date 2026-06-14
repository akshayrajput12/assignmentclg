# AI_USAGE.md — AI Usage Log

This log documents the AI tools used, the prompt strategies applied, and three specific technical cases where the AI made a mistake, how it was caught, and how it was corrected.

---

## 1. AI Tools Used & Prompting Strategy

- **AI Model:** Gemini 3.5 Flash (High) via Antigravity Coding Assistant.
- **Role Definition:** Acted as a senior frontend engineer and product manager pair-programmer.
- **Key Prompt Patterns:**
  - *Context Retrieval Prompt:* "Resolve the TinyURL redirect, find where the spreadsheet is, and check if it's stored on the system."
  - *State Machine Implementation Prompt:* "Write a custom parser in TypeScript that splits lines on commas but ignores commas when they are inside double quotes."
  - *Prisma 7 Schema Prompt:* "Update the database model for timeline membership and transaction tracking to match PostgreSQL specifications."

---

## 2. Concrete Errors and Corrections

### Case 1: Prisma 7 Datasource URL Deprecation
- **What went wrong:** The AI initially generated a standard Prisma `schema.prisma` datasource block containing `url = env("DATABASE_URL")`. When running `npx prisma generate`, Prisma 7.8.0 crashed with error `P1012`:
  ```
  error: The datasource property `url` is no longer supported in schema files. Move connection URLs for Migrate to `prisma.config.ts`...
  ```
- **How we caught it:** We proactively ran `npx prisma generate` in the terminal and inspected the command output, revealing that Prisma 7 has deprecated the `url` property in `schema.prisma`.
- **What we changed:**
  1. We stripped `url = env("DATABASE_URL")` from `schema.prisma` leaving only `provider = "postgresql"`.
  2. We verified that `prisma.config.ts` was correctly configured to hold the connection string via `@prisma/config`'s `defineConfig` utility.
  3. We updated the generator and ran `npx prisma generate` again, which compiled successfully.

### Case 2: Next.js 16 Dynamic Route Params Type Mismatch
- **What went wrong:** When building the dynamic ledger API route at `src/app/api/balances/ledger/[name]/route.ts`, the AI initially typed the parameter resolver as a synchronous object:
  ```typescript
  export async function GET(req: NextRequest, { params }: { params: { name: string } }) {
    const name = params.name;
    ...
  }
  ```
- **How we caught it:** We ran `npm run build` to verify compile safety. The compiler failed with a type error indicating that `params` is an asynchronous `Promise` in Next.js 16/React 19.
- **What we changed:** We modified the handler signature to type `params` as `Promise<{ name: string }>` and awaited it before decoding:
  ```typescript
  export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
    const resolvedParams = await params;
    const name = decodeURIComponent(resolvedParams.name);
    ...
  }
  ```
  This resolved the type check error, and the production build succeeded.

### Case 3: Missing Typings on NormalizedExpense Object
- **What went wrong:** In `src/app/page.tsx`, we were modifying and assigning `exchangeRate` and `amountInr` to our `NormalizedExpense` objects during USD conversion. However, these fields were omitted from the `NormalizedExpense` interface defined in `src/lib/parser.ts`, leading to a compile error:
  ```
  Type error: Property 'exchangeRate' does not exist on type 'NormalizedExpense'.
  ```
- **How we caught it:** During the `npm run build` check, the compiler reported type mismatches in the page's state mapping functions.
- **What we changed:** We updated the `NormalizedExpense` interface in `src/lib/parser.ts` to include `exchangeRate: number` and `amountInr: number` and added them in the parser's array push statements. This resolved the compile checks.
