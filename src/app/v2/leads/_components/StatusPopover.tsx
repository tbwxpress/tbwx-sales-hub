"use client"

import * as React from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import Badge, { statusTone, type BadgeTone } from "@/components/ui/Badge"
import type { LeadStatus } from "@/lib/types"

type Option = { value: LeadStatus; label: string; tone: BadgeTone }

const OPTIONS: Option[] = [
  { value: "NEW",                   label: "Active",   tone: "active" },
  { value: "HOT",                   label: "Hot",      tone: "hot" },
  { value: "NO_RESPONSE",           label: "Waiting",  tone: "waiting" },
  { value: "CALL_DONE_INTERESTED",  label: "Waiting",  tone: "waiting" },
  { value: "FINAL_NEGOTIATION",     label: "Hot",      tone: "hot" },
  { value: "CONVERTED",             label: "Won",      tone: "won" },
  { value: "LOST",                  label: "Lost",     tone: "lost" },
]

// Show the 5 canonical states in the popover (Active / Hot / Waiting / Won / Lost)
const CANON: Option[] = [
  { value: "NEW",          label: "Active",  tone: "active" },
  { value: "HOT",          label: "Hot",     tone: "hot" },
  { value: "NO_RESPONSE",  label: "Waiting", tone: "waiting" },
  { value: "CONVERTED",    label: "Won",     tone: "won" },
  { value: "LOST",         label: "Lost",    tone: "lost" },
]

function statusLabel(status: string | null | undefined): string {
  const upper = (status || "").toUpperCase()
  const match = OPTIONS.find((o) => o.value === upper)
  if (match) return match.label
  if (["DECK_SENT", "REPLIED", "DELAYED"].includes(upper)) return "Waiting"
  if (upper === "ARCHIVED") return "Lost"
  return "Active"
}

export default function StatusPopover({
  status,
  onChange,
}: {
  status: LeadStatus | string
  onChange?: (next: LeadStatus) => void
}) {
  const [open, setOpen] = React.useState(false)
  const tone = statusTone(status)
  const label = statusLabel(status)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Change status"
            className="inline-flex outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-full"
            onClick={(e) => e.stopPropagation()}
          >
            <Badge tone={tone}>{label}</Badge>
          </button>
        }
      />
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-56 p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="Set status…" />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {CANON.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onChange?.(opt.value)
                    setOpen(false)
                  }}
                >
                  <Badge tone={opt.tone}>{opt.label}</Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
