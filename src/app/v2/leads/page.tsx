"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Plus, AlertCircle, UserPlus, Tag, Download, X } from "lucide-react"
import type { Lead, ApiResponse, LeadStatus } from "@/lib/types"
import { buildColumns } from "./_components/columns"
import LeadSheet from "./_components/LeadSheet"

type Segment = "all" | "hot" | "mine" | "unassigned" | "today"

const ME = "Gavish" // preview-only; real session wires in production

function startOfTodayIST(): number {
  const now = new Date()
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }))
  ist.setHours(0, 0, 0, 0)
  return ist.getTime()
}
function endOfTodayIST(): number {
  return startOfTodayIST() + 24 * 60 * 60 * 1000 - 1
}

export default function LeadsV2Page() {
  const [leads, setLeads] = React.useState<Lead[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [segment, setSegment] = React.useState<Segment>("all")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [priorityFilter, setPriorityFilter] = React.useState<string>("all")
  const [agentFilter, setAgentFilter] = React.useState<string>("all")
  const [cityFilter, setCityFilter] = React.useState<string>("all")

  const [sorting, setSorting] = React.useState<SortingState>([])
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  const [activeLead, setActiveLead] = React.useState<Lead | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)

  // Fetch
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch("/api/leads")
        const data = (await res.json()) as ApiResponse<Lead[]>
        if (cancelled) return
        if (data.success && data.data) {
          setLeads(data.data)
        } else {
          setError(data.error || "Failed to load leads")
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleStatusChange = React.useCallback((lead: Lead, next: LeadStatus) => {
    setLeads((prev) =>
      prev.map((l) => (l.row_number === lead.row_number ? { ...l, lead_status: next } : l)),
    )
    toast.success(`Updated · ${lead.full_name || "Lead"} → ${next}`, {
      description: "Preview only — not persisted",
    })
  }, [])

  // Derived: unique agents, cities for filter dropdowns
  const agents = React.useMemo(() => {
    const s = new Set<string>()
    leads.forEach((l) => l.assigned_to && s.add(l.assigned_to))
    return Array.from(s).sort()
  }, [leads])
  const cities = React.useMemo(() => {
    const s = new Set<string>()
    leads.forEach((l) => l.city && s.add(l.city))
    return Array.from(s).sort()
  }, [leads])

  // Segment filter
  const segmented = React.useMemo(() => {
    if (segment === "all") return leads
    if (segment === "hot") {
      return leads.filter(
        (l) =>
          l.lead_status === "HOT" ||
          l.lead_status === "FINAL_NEGOTIATION" ||
          (l.lead_priority || "").toUpperCase() === "HOT",
      )
    }
    if (segment === "mine") {
      return leads.filter((l) => (l.assigned_to || "").toLowerCase() === ME.toLowerCase())
    }
    if (segment === "unassigned") return leads.filter((l) => !l.assigned_to)
    if (segment === "today") {
      const start = startOfTodayIST()
      const end = endOfTodayIST()
      return leads.filter((l) => {
        if (!l.next_followup) return false
        const t = new Date(l.next_followup).getTime()
        return t >= start && t <= end
      })
    }
    return leads
  }, [leads, segment])

  // Filter chips
  const filtered = React.useMemo(() => {
    return segmented.filter((l) => {
      if (statusFilter !== "all" && l.lead_status !== statusFilter) return false
      if (priorityFilter !== "all" && (l.lead_priority || "").toUpperCase() !== priorityFilter) return false
      if (agentFilter !== "all" && l.assigned_to !== agentFilter) return false
      if (cityFilter !== "all" && l.city !== cityFilter) return false
      return true
    })
  }, [segmented, statusFilter, priorityFilter, agentFilter, cityFilter])

  // Counts (use leads, not filtered — these are global indicators)
  const counts = React.useMemo(() => {
    const active = leads.filter(
      (l) => l.lead_status !== "CONVERTED" && l.lead_status !== "LOST" && l.lead_status !== "ARCHIVED",
    ).length
    const hot = leads.filter(
      (l) =>
        l.lead_status === "HOT" ||
        l.lead_status === "FINAL_NEGOTIATION" ||
        (l.lead_priority || "").toUpperCase() === "HOT",
    ).length
    return { active, hot }
  }, [leads])

  const columns = React.useMemo(
    () => buildColumns({ onStatusChange: handleStatusChange }),
    [handleStatusChange],
  )

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => String(row.row_number ?? row.id),
    enableRowSelection: true,
  })

  const selectedCount = Object.keys(rowSelection).length

  const openLead = (lead: Lead) => {
    setActiveLead(lead)
    setSheetOpen(true)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="display text-[34px] leading-none font-bold tracking-tight" style={{ color: "var(--color-text)" }}>
            Leads
          </h1>
          <p className="text-xs mt-1.5" style={{ color: "var(--color-muted)" }}>
            {loading ? (
              <span className="inline-block w-32 h-3 align-middle bg-muted rounded animate-pulse" />
            ) : (
              <>
                <span className="font-medium" style={{ color: "var(--color-text)" }}>{counts.active}</span> active ·{" "}
                <span className="font-medium" style={{ color: "var(--color-text)" }}>{counts.hot}</span> hot
              </>
            )}
          </p>
        </div>
        <Button variant="default" size="sm">
          <Plus className="size-3.5" strokeWidth={2} /> New lead
        </Button>
      </div>

      {/* Segment tabs */}
      <Tabs value={segment} onValueChange={(v) => setSegment(v as Segment)}>
        <TabsList variant="line">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="hot">Hot</TabsTrigger>
          <TabsTrigger value="mine">Mine</TabsTrigger>
          <TabsTrigger value="unassigned">Unassigned</TabsTrigger>
          <TabsTrigger value="today">Due today</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger size="sm" className="min-w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="NEW">Active</SelectItem>
            <SelectItem value="HOT">Hot</SelectItem>
            <SelectItem value="NO_RESPONSE">Waiting</SelectItem>
            <SelectItem value="CONVERTED">Won</SelectItem>
            <SelectItem value="LOST">Lost</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v ?? "all")}>
          <SelectTrigger size="sm" className="min-w-[130px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="HOT">Hot</SelectItem>
            <SelectItem value="WARM">Warm</SelectItem>
            <SelectItem value="COLD">Cold</SelectItem>
          </SelectContent>
        </Select>
        <Select value={agentFilter} onValueChange={(v) => setAgentFilter(v ?? "all")}>
          <SelectTrigger size="sm" className="min-w-[150px]">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={cityFilter} onValueChange={(v) => setCityFilter(v ?? "all")}>
          <SelectTrigger size="sm" className="min-w-[140px]">
            <SelectValue placeholder="City" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All cities</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <span className="text-[11px]" style={{ color: "var(--color-dim)" }}>
          {loading ? "Loading…" : `${filtered.length} of ${leads.length}`}
        </span>
      </div>

      {/* Table */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ background: "var(--color-card)", border: "1px solid var(--color-border-light)" }}
      >
        <Table>
          <TableHeader
            className="sticky top-0 z-10"
            style={{ background: "var(--color-elevated)" }}
          >
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} style={{ borderColor: "var(--color-border-light)" }}>
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    className="h-9 text-[10.5px] uppercase tracking-wider font-semibold"
                    style={{ color: "var(--color-muted)" }}
                  >
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`} style={{ borderColor: "var(--color-border-light)" }}>
                  {columns.map((c, j) => (
                    <TableCell key={j} className="h-9 py-1.5">
                      <Skeleton className="h-3.5 w-3/4" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center">
                  <div className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--color-danger)" }}>
                    <AlertCircle className="size-4" strokeWidth={1.75} />
                    {error}
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-12 text-center text-sm" style={{ color: "var(--color-muted)" }}>
                  No leads match this view.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  onClick={() => openLead(row.original)}
                  className="cursor-pointer transition-colors"
                  style={{
                    borderColor: "var(--color-border-light)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--color-elevated)"
                  }}
                  onMouseLeave={(e) => {
                    if (!row.getIsSelected()) e.currentTarget.style.backgroundColor = ""
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="h-9 py-1 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 px-3 py-2 rounded-lg"
          style={{
            background: "var(--color-text)",
            color: "var(--color-bg)",
            border: "2px solid var(--color-border)",
          }}
        >
          <span className="text-[12px] font-medium px-2">
            {selectedCount} selected
          </span>
          <span className="inline-block w-px h-5" style={{ background: "color-mix(in srgb, var(--color-bg) 25%, transparent)" }} />
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded hover:opacity-80"
            onClick={() => toast.info("Assign · preview only")}
          >
            <UserPlus className="size-3.5" strokeWidth={1.75} /> Assign
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded hover:opacity-80"
            onClick={() => toast.info("Change status · preview only")}
          >
            <Tag className="size-3.5" strokeWidth={1.75} /> Change status
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded hover:opacity-80"
            onClick={() => toast.info("Export · preview only")}
          >
            <Download className="size-3.5" strokeWidth={1.75} /> Export
          </button>
          <span className="inline-block w-px h-5" style={{ background: "color-mix(in srgb, var(--color-bg) 25%, transparent)" }} />
          <button
            type="button"
            aria-label="Clear selection"
            className="inline-flex items-center justify-center size-6 rounded hover:opacity-80"
            onClick={() => setRowSelection({})}
          >
            <X className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
      )}

      {/* Detail sheet */}
      <LeadSheet lead={activeLead} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  )
}
