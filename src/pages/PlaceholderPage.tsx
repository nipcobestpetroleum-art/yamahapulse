import { useLocation } from "react-router-dom";
import { History } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { findNavItem, PHASE_BY_SECTION } from "@/lib/navigation";

export default function PlaceholderPage() {
  const { pathname } = useLocation();
  const lookup = findNavItem(pathname);

  const title = lookup?.item.title ?? "Module";
  const sectionLabel = lookup?.section.label ?? "Platform";
  const Icon = lookup?.item.icon ?? History;
  const phase = lookup ? PHASE_BY_SECTION[lookup.section.label] : null;

  return (
    <div>
      <PageHeader title={title} description={sectionLabel} />
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Icon className="h-7 w-7 text-muted-foreground" strokeWidth={1.6} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">{title} is on the roadmap</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            This module is scheduled for {phase ? `Phase ${phase}` : "an upcoming phase"} of the
            FleetPulse rollout. Phase 1 covers authentication, organizations, the dashboard,
            vehicles and GPS devices.
          </p>
        </div>
        {phase && (
          <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            Coming in Phase {phase}
          </span>
        )}
      </div>
    </div>
  );
}