import type { Metadata } from "next";
import { Suspense } from "react";
import { RelayStage } from "@/components/relay-stage";

export const metadata: Metadata = {
  title: "Relay",
  description: "Live Wikipedia edits. Change the policy and watch the backlog flip.",
};

export default function Page() {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-50 bg-[#100e0c]" />}>
      <RelayStage />
    </Suspense>
  );
}
