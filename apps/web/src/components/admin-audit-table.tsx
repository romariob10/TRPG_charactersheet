"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Filter, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AdminAuditEvent } from "@mycharacter/contracts";
import { formatRelativeDate } from "@/lib/utils";

export function AdminAuditTable({
  initialEvents,
  locale,
}: {
  initialEvents: AdminAuditEvent[];
  locale: string;
}) {
  const t = useTranslations("AdminConsole.audit");
  const [events] = useState<AdminAuditEvent[]>(initialEvents);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [targetFilter, setTargetFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const actions = useMemo(() => {
    return Array.from(new Set(events.map((e) => e.action)));
  }, [events]);

  const targetTypes = useMemo(() => {
    return Array.from(new Set(events.map((e) => e.targetType)));
  }, [events]);

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((event) => {
      if (actionFilter !== "all" && event.action !== actionFilter) return false;
      if (targetFilter !== "all" && event.targetType !== targetFilter) return false;
      if (!q) return true;
      return (
        event.action.toLowerCase().includes(q) ||
        event.targetType.toLowerCase().includes(q) ||
        (event.actorUsername && event.actorUsername.toLowerCase().includes(q)) ||
        (event.reason && event.reason.toLowerCase().includes(q)) ||
        (event.targetId && event.targetId.toLowerCase().includes(q))
      );
    });
  }, [actionFilter, events, query, targetFilter]);

  return (
    <div>
      {/* Filters Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Action Filter */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-9 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-xs font-semibold text-[var(--foreground)] outline-none focus:border-[var(--brand)]"
          >
            <option value="all">{t("filterByAction")}</option>
            {actions.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>

          {/* Target Type Filter */}
          <select
            value={targetFilter}
            onChange={(e) => setTargetFilter(e.target.value)}
            className="h-9 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-xs font-semibold text-[var(--foreground)] outline-none focus:border-[var(--brand)]"
          >
            <option value="all">{t("filterByTarget")}</option>
            {targetTypes.map((tgt) => (
              <option key={tgt} value={tgt}>
                {tgt}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <label className="relative block w-full sm:w-60">
          <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search audit..."
            className="h-9 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] pr-3 pl-8 text-xs outline-none focus:border-[var(--brand)]"
          />
        </label>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted)]">
            <tr>
              <th className="w-8 px-3 py-2.5"></th>
              <th className="px-3 py-2.5 font-bold uppercase">{t("action")}</th>
              <th className="px-3 py-2.5 font-bold uppercase">{t("actor")}</th>
              <th className="px-3 py-2.5 font-bold uppercase">{t("target")}</th>
              <th className="px-3 py-2.5 font-bold uppercase">{t("date")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
            {filteredEvents.length > 0 ? (
              filteredEvents.map((event) => {
                const isExpanded = expandedId === event.id;
                return (
                  <tr key={event.id} className="group hover:bg-[var(--keylime)]/30">
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : event.id)
                        }
                        className="grid size-6 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--keylime)]"
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-md bg-[var(--keylime)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--brand)]">
                        {event.action}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold">
                        {event.actorUsername
                          ? `@${event.actorUsername}`
                          : event.actorRole}
                      </span>
                      <span className="ml-1 text-[11px] text-[var(--muted)]">
                        ({event.actorRole})
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-[var(--muted)]">
                      {event.targetType}
                      {event.targetId ? ` (${event.targetId.slice(0, 8)}...)` : ""}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--muted)]">
                      {formatRelativeDate(event.createdAt, locale)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-[var(--muted)]"
                >
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Expanded Metadata Viewer Drawer/Modal */}
      {expandedId && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
          {(() => {
            const ev = events.find((e) => e.id === expandedId);
            if (!ev) return null;
            return (
              <div>
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                  <h3 className="font-bold text-[var(--brand)]">
                    Event Details: {ev.action} ({ev.id})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setExpandedId(null)}
                    className="text-xs font-bold text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <span className="font-bold text-[var(--muted)]">Actor: </span>
                    <span>{ev.actorUsername ? `@${ev.actorUsername}` : ev.actorRole} ({ev.actorId})</span>
                  </div>
                  <div>
                    <span className="font-bold text-[var(--muted)]">Target: </span>
                    <span>{ev.targetType} ({ev.targetId ?? "none"})</span>
                  </div>
                  {ev.reason && (
                    <div className="col-span-2">
                      <span className="font-bold text-[var(--muted)]">Reason: </span>
                      <span>{ev.reason}</span>
                    </div>
                  )}
                </div>
                <div className="mt-3">
                  <span className="block text-xs font-bold text-[var(--muted)]">Metadata:</span>
                  <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-[var(--surface)] p-3 font-mono text-xs text-[var(--foreground)]">
                    {JSON.stringify(ev.metadata, null, 2)}
                  </pre>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
