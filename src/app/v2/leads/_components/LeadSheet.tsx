"use client"

import * as React from "react"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import Badge, { statusTone, priorityTone } from "@/components/ui/Badge"
import { timeAgo } from "@/lib/format"
import type { Lead } from "@/lib/types"
import { Phone, MessageSquare, Mail, MapPin, StickyNote, PhoneCall, Send, Plus } from "lucide-react"

type Props = {
  lead: Lead | null
  open: boolean
  onOpenChange: (v: boolean) => void
}

function statusLabel(status: string): string {
  const upper = (status || "").toUpperCase()
  if (["HOT", "FINAL_NEGOTIATION"].includes(upper)) return "Hot"
  if (["NO_RESPONSE", "DELAYED", "CALL_DONE_INTERESTED", "DECK_SENT", "REPLIED"].includes(upper)) return "Waiting"
  if (upper === "CONVERTED") return "Won"
  if (upper === "LOST" || upper === "ARCHIVED") return "Lost"
  return "Active"
}

const MOCK_ACTIVITY = [
  { icon: PhoneCall, text: "Outbound call · 4m 12s", when: "2h ago", by: "You" },
  { icon: MessageSquare, text: "WA template sent · franchise_intro_v3", when: "1d ago", by: "Auto" },
  { icon: StickyNote, text: 'Note added · "Asked for Mumbai zone exclusivity"', when: "3d ago", by: "Rohit" },
]

function ContactRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="size-3.5 mt-0.5 shrink-0" style={{ color: "var(--color-dim)" }} strokeWidth={1.75} />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-dim)" }}>{label}</div>
        <div className="text-[13px] mt-0.5 truncate" style={{ color: "var(--color-text)" }}>
          {value || <span style={{ color: "var(--color-dim)" }} className="italic">Not provided</span>}
        </div>
      </div>
    </div>
  )
}

export default function LeadSheet({ lead, open, onOpenChange }: Props) {
  if (!lead) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!w-full sm:!max-w-[720px] !p-0 flex flex-col"
        style={{ background: "var(--color-card)", color: "var(--color-text)" }}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4" style={{ borderBottom: "2px solid var(--color-border)" }}>
          <div className="flex items-start justify-between gap-4 pr-10">
            <div className="min-w-0">
              <SheetTitle
                render={
                  <h2 className="display text-[26px] font-bold leading-tight tracking-tight truncate" style={{ color: "var(--color-text)" }}>
                    {lead.full_name || "Unnamed lead"}
                  </h2>
                }
              />
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge tone={statusTone(lead.lead_status)}>{statusLabel(lead.lead_status)}</Badge>
                {lead.lead_priority && (
                  <Badge tone={priorityTone(lead.lead_priority)}>{lead.lead_priority}</Badge>
                )}
                <span className="text-[11px]" style={{ color: "var(--color-dim)" }}>
                  · Created {timeAgo(lead.created_time)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="flex-1 min-h-0 flex flex-col">
          <div className="px-6 pt-3" style={{ borderBottom: "1px solid var(--color-border-light)" }}>
            <TabsList variant="line" className="h-9">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="messages">Messages</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <TabsContent value="overview" className="p-6 space-y-6">
              {/* Quick actions */}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm">
                  <PhoneCall className="size-3.5" strokeWidth={1.75} /> Log call
                </Button>
                <Button variant="outline" size="sm">
                  <Send className="size-3.5" strokeWidth={1.75} /> Send WA
                </Button>
                <Button variant="outline" size="sm">
                  <Plus className="size-3.5" strokeWidth={1.75} /> Add note
                </Button>
              </div>

              {/* Contact card */}
              <section
                className="rounded-lg overflow-hidden"
                style={{ background: "var(--color-bg)", border: "1px solid var(--color-border-light)" }}
              >
                <div
                  className="px-4 py-2 text-[10px] uppercase tracking-wider font-semibold"
                  style={{ color: "var(--color-muted)", borderBottom: "1px solid var(--color-border-light)" }}
                >
                  Contact
                </div>
                <div className="px-4 py-2 divide-y" style={{ borderColor: "var(--color-border-light)" }}>
                  <ContactRow icon={Phone} label="Phone" value={lead.phone} />
                  <ContactRow icon={Mail} label="Email" value={lead.email} />
                  <ContactRow icon={MapPin} label="City" value={[lead.city, lead.state].filter(Boolean).join(", ")} />
                </div>
              </section>

              {/* Recent activity */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--color-muted)" }}>
                    Recent activity
                  </h3>
                  <span className="text-[11px]" style={{ color: "var(--color-dim)" }}>last 3</span>
                </div>
                <ol
                  className="rounded-lg overflow-hidden"
                  style={{ background: "var(--color-bg)", border: "1px solid var(--color-border-light)" }}
                >
                  {MOCK_ACTIVITY.map((a, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 px-4 py-2.5"
                      style={{ borderTop: i === 0 ? "none" : "1px solid var(--color-border-light)" }}
                    >
                      <a.icon className="size-3.5 mt-0.5 shrink-0" style={{ color: "var(--color-muted)" }} strokeWidth={1.75} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] leading-snug" style={{ color: "var(--color-text)" }}>{a.text}</div>
                        <div className="text-[10.5px] mt-0.5" style={{ color: "var(--color-dim)" }}>
                          {a.when} · {a.by}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              {lead.notes && (
                <section>
                  <h3 className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--color-muted)" }}>
                    Notes
                  </h3>
                  <p
                    className="text-[13px] leading-relaxed px-4 py-3 rounded-lg whitespace-pre-wrap"
                    style={{ background: "var(--color-bg)", border: "1px solid var(--color-border-light)", color: "var(--color-body)" }}
                  >
                    {lead.notes}
                  </p>
                </section>
              )}
            </TabsContent>

            <TabsContent value="activity" className="p-10 text-center">
              <p className="text-sm italic" style={{ color: "var(--color-dim)" }}>Coming in production build</p>
            </TabsContent>
            <TabsContent value="messages" className="p-10 text-center">
              <p className="text-sm italic" style={{ color: "var(--color-dim)" }}>Coming in production build</p>
            </TabsContent>
            <TabsContent value="files" className="p-10 text-center">
              <p className="text-sm italic" style={{ color: "var(--color-dim)" }}>Coming in production build</p>
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
