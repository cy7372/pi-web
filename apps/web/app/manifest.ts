// output:'export' requires route handlers (including the metadata manifest) to
// be explicitly static. apps/api serves this route dynamically — this shim only
// exists for the static web export.
export const dynamic = "force-static";

export { default } from "@/app-src/manifest";
