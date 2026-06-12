// Ambient Next.js types for the STANDALONE typecheck (tsconfig.typecheck.json)
// — same as next-env.d.ts but WITHOUT the import of .next/dev/types/routes.d.ts,
// which the dev server rewrites continuously (half-written file = phantom
// syntax errors). `next build` still validates the generated route types.
/// <reference types="next" />
/// <reference types="next/image-types/global" />
