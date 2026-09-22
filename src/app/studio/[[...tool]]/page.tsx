import { sanityConfigured } from "@/lib/sanity/env";
import StudioClient from "./StudioClient";

export const dynamic = "force-static";

export { viewport } from "next-sanity/studio";

export default function StudioPage() {
  if (!sanityConfigured) {
    return (
      <div style={{ maxWidth: 640, margin: "4rem auto", padding: "0 1.5rem", fontFamily: "system-ui, sans-serif", color: "#201217" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>Studio not connected yet</h1>
        <p style={{ marginBottom: "0.75rem" }}>
          This admin dashboard runs on Sanity, but no project has been created yet. To finish setup:
        </p>
        <ol style={{ paddingLeft: "1.25rem", lineHeight: 1.7 }}>
          <li>Create a free project at sanity.io and note its Project ID.</li>
          <li>
            Set <code>NEXT_PUBLIC_SANITY_PROJECT_ID</code> and <code>NEXT_PUBLIC_SANITY_DATASET</code> (see{" "}
            <code>.env.example</code>) in your deployment environment&apos;s settings.
          </li>
          <li>Invite the Headteacher as an Editor and yourself/the Owner as Administrator, from Sanity&apos;s project members page.</li>
          <li>Redeploy — this page then becomes the live content editor.</li>
        </ol>
        <p style={{ marginTop: "0.75rem" }}>Until then, every page renders from the placeholder content bundled in the codebase.</p>
      </div>
    );
  }

  return <StudioClient />;
}
