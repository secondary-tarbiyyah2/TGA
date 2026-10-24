import type { Metadata } from "next";
import { InstallGuide } from "@/components/learn/InstallGuide";

export const metadata: Metadata = { title: "Install the app" };

export default function InstallPage() {
  return (
    <section className="app-pad">
      <InstallGuide />
    </section>
  );
}
