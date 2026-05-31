"use client"

import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Checkbox } from "@/components/ui/checkbox"
import Badge, { priorityTone } from "@/components/ui/Badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { timeAgo } from "@/lib/format"
import type { Lead } from "@/lib/types"
import StatusPopover from "./StatusPopover"

function initials(name: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Stable warm hue per name (cream / ink / yellow / orange family only)
const DOT_HUES = [
  "var(--color-accent)",                                              // yellow
  "color-mix(in srgb, var(--color-accent) 55%, var(--color-bg))",     // pale yellow
  "color-mix(in srgb, var(--color-danger) 65%, var(--color-bg))",     // soft orange
  "color-mix(in srgb, var(--color-text) 18%, var(--color-bg))",       // toasted cream
]
function dotColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return DOT_HUES[h % DOT_HUES.length]
}

export type LeadRow = Lead

export function buildColumns({
  onStatusChange,
}: {
  onStatusChange?: (lead: Lead, next: Lead["lead_status"]) => void
}): ColumnDef<LeadRow>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <div className="pl-3 pr-2" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="pl-3 pr-2" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label="Select row"
          />
        </div>
      ),
      enableSorting: false,
      size: 36,
    },
    {
      accessorKey: "full_name",
      header: "Name",
      cell: ({ row }) => {
        const name = row.original.full_name || "Unknown"
        return (
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar size="sm" className="shrink-0">
              <AvatarFallback
                className="text-[10px] font-semibold"
                style={{ backgroundColor: dotColor(name), color: "var(--color-text)" }}
              >
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="text-[13px] font-medium leading-tight truncate" style={{ color: "var(--color-text)" }}>
                {name}
              </div>
              <div className="text-[10.5px] leading-tight truncate" style={{ color: "var(--color-dim)" }}>
                {row.original.phone || row.original.email || "—"}
              </div>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "lead_status",
      header: "Status",
      cell: ({ row }) => (
        <StatusPopover
          status={row.original.lead_status}
          onChange={(next) => onStatusChange?.(row.original, next)}
        />
      ),
      size: 120,
    },
    {
      accessorKey: "lead_priority",
      header: "Priority",
      cell: ({ row }) => {
        const p = row.original.lead_priority
        if (!p) return <span className="text-[12px]" style={{ color: "var(--color-dim)" }}>—</span>
        return <Badge tone={priorityTone(p)}>{p}</Badge>
      },
      size: 100,
    },
    {
      accessorKey: "assigned_to",
      header: "Assigned",
      cell: ({ row }) => {
        const a = row.original.assigned_to
        if (!a) {
          return (
            <span className="text-[12px] italic" style={{ color: "var(--color-dim)" }}>
              Unassigned
            </span>
          )
        }
        return (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-5 h-5 rounded-full text-[9px] font-semibold flex items-center justify-center"
              style={{ backgroundColor: dotColor(a), color: "var(--color-text)" }}
            >
              {initials(a)}
            </span>
            <span className="text-[12px]" style={{ color: "var(--color-body)" }}>{a}</span>
          </div>
        )
      },
      size: 160,
    },
    {
      accessorKey: "city",
      header: "City",
      cell: ({ row }) => (
        <span className="text-[12px]" style={{ color: "var(--color-body)" }}>
          {row.original.city || <span style={{ color: "var(--color-dim)" }}>—</span>}
        </span>
      ),
      size: 140,
    },
    {
      id: "amount",
      header: () => <div className="text-right pr-3">Amount</div>,
      cell: ({ row }) => {
        // Use lead_score as a proxy "amount" for the preview (no real amount field)
        const score = row.original.lead_score
        if (typeof score !== "number") {
          return (
            <div className="text-right pr-3 text-[12px]" style={{ color: "var(--color-dim)" }}>
              —
            </div>
          )
        }
        return (
          <div className="text-right pr-3 tabular-nums text-[12.5px] font-medium" style={{ color: "var(--color-text)" }}>
            ₹{(score * 1000).toLocaleString("en-IN")}
          </div>
        )
      },
      size: 110,
    },
    {
      accessorKey: "created_time",
      header: "Last activity",
      cell: ({ row }) => (
        <span className="text-[12px]" style={{ color: "var(--color-dim)" }}>
          {timeAgo(row.original.created_time)}
        </span>
      ),
      size: 110,
    },
  ]
}
