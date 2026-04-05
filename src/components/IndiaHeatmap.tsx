'use client'

import { useState, useMemo } from 'react'
import { projectLatLng } from '@/config/india-cities'
import { INDIA_SVG_PATH } from '@/lib/india-map'

interface CityAgent {
  name: string
  total: number
  converted: number
  interested: number
  conversionRate: number
}

interface City {
  name: string
  state: string
  lat: number
  lng: number
  total: number
  converted: number
  interested: number
  lost: number
  conversionRate: number
  agents: CityAgent[]
}

interface Props {
  cities: City[]
}

const VIEW_W = 1000
const VIEW_H = 1000

export default function IndiaHeatmap({ cities }: Props) {
  const [hoveredCity, setHoveredCity] = useState<City | null>(null)
  const [selectedCity, setSelectedCity] = useState<City | null>(null)

  // Compute radius scale — bubble size proportional to sqrt(leads)
  const { maxLeads, minRadius, maxRadius } = useMemo(() => {
    const max = Math.max(...cities.map(c => c.total), 1)
    return { maxLeads: max, minRadius: 6, maxRadius: 38 }
  }, [cities])

  function getRadius(total: number): number {
    if (total === 0) return 0
    const normalized = Math.sqrt(total / maxLeads)
    return minRadius + normalized * (maxRadius - minRadius)
  }

  function getColor(city: City): string {
    // Color by conversion rate
    if (city.conversionRate >= 20) return 'var(--color-status-converted)'
    if (city.conversionRate >= 10) return 'var(--color-status-interested)'
    if (city.conversionRate > 0) return 'var(--color-status-delayed)'
    return 'var(--color-priority-hot)'
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-text">Lead Distribution — India</h3>
          <p className="text-[11px] text-dim mt-0.5">{cities.length} cities · Bubble size = lead volume · Color = conversion rate</p>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--color-status-converted)' }} />
            <span className="text-dim">20%+</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--color-status-interested)' }} />
            <span className="text-dim">10-20%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--color-status-delayed)' }} />
            <span className="text-dim">1-10%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--color-priority-hot)' }} />
            <span className="text-dim">0%</span>
          </div>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full h-auto"
          style={{ maxHeight: '600px' }}
        >
          {/* India outline */}
          <path
            d={INDIA_SVG_PATH}
            fill="var(--color-elevated)"
            stroke="var(--color-border-light)"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />

          {/* City bubbles */}
          {cities.map((city, i) => {
            const { x, y } = projectLatLng(city.lat, city.lng, VIEW_W, VIEW_H)
            const r = getRadius(city.total)
            const color = getColor(city)
            const isActive = hoveredCity?.name === city.name || selectedCity?.name === city.name

            return (
              <g key={`${city.name}-${i}`}>
                {/* Pulse ring for active */}
                {isActive && (
                  <circle
                    cx={x}
                    cy={y}
                    r={r + 4}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    opacity={0.5}
                  />
                )}
                {/* Main bubble */}
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={color}
                  fillOpacity={0.55}
                  stroke={color}
                  strokeWidth={1.5}
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setHoveredCity(city)}
                  onMouseLeave={() => setHoveredCity(null)}
                  onClick={() => setSelectedCity(city === selectedCity ? null : city)}
                />
                {/* Label for top cities */}
                {city.total >= maxLeads * 0.15 && (
                  <text
                    x={x}
                    y={y - r - 4}
                    textAnchor="middle"
                    fontSize={16}
                    fontWeight={600}
                    fill="var(--color-text)"
                    pointerEvents="none"
                    style={{ textShadow: '0 0 4px var(--color-bg)' }}
                  >
                    {city.name}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Hover tooltip */}
        {hoveredCity && !selectedCity && (
          <div className="absolute top-2 right-2 bg-card border border-border rounded-lg p-3 shadow-lg pointer-events-none min-w-[180px]">
            <div className="text-sm font-bold text-text">{hoveredCity.name}</div>
            <div className="text-[10px] text-dim mb-2">{hoveredCity.state}</div>
            <div className="grid grid-cols-2 gap-1 text-[11px]">
              <span className="text-dim">Leads</span>
              <span className="text-text font-medium text-right">{hoveredCity.total}</span>
              <span className="text-dim">Converted</span>
              <span className="text-text font-medium text-right">{hoveredCity.converted}</span>
              <span className="text-dim">Interested</span>
              <span className="text-text font-medium text-right">{hoveredCity.interested}</span>
              <span className="text-dim">Conv. rate</span>
              <span className="font-medium text-right" style={{ color: getColor(hoveredCity) }}>
                {hoveredCity.conversionRate}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Selected city detail panel */}
      {selectedCity && (
        <div className="mt-4 border border-border rounded-lg p-4 bg-elevated/30">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="text-base font-bold text-text">{selectedCity.name}</h4>
              <p className="text-xs text-dim">{selectedCity.state}</p>
            </div>
            <button
              onClick={() => setSelectedCity(null)}
              className="text-dim hover:text-text transition-colors"
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* City stats */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div className="bg-card border border-border rounded px-2 py-2">
              <p className="text-[9px] text-dim uppercase tracking-wider">Total</p>
              <p className="text-lg font-bold text-text">{selectedCity.total}</p>
            </div>
            <div className="bg-card border border-border rounded px-2 py-2">
              <p className="text-[9px] text-dim uppercase tracking-wider">Converted</p>
              <p className="text-lg font-bold text-status-converted">{selectedCity.converted}</p>
            </div>
            <div className="bg-card border border-border rounded px-2 py-2">
              <p className="text-[9px] text-dim uppercase tracking-wider">Interested</p>
              <p className="text-lg font-bold text-status-interested">{selectedCity.interested}</p>
            </div>
            <div className="bg-card border border-border rounded px-2 py-2">
              <p className="text-[9px] text-dim uppercase tracking-wider">Conv. %</p>
              <p className="text-lg font-bold" style={{ color: getColor(selectedCity) }}>
                {selectedCity.conversionRate}%
              </p>
            </div>
          </div>

          {/* Per-agent table */}
          {selectedCity.agents.length > 0 ? (
            <div>
              <h5 className="text-[10px] font-semibold text-dim uppercase tracking-wider mb-2">Agent Performance</h5>
              <div className="bg-card border border-border rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50 bg-elevated/30">
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-dim uppercase tracking-wider">Agent</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold text-dim uppercase tracking-wider">Assigned</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold text-dim uppercase tracking-wider">Interested</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold text-dim uppercase tracking-wider">Converted</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold text-dim uppercase tracking-wider">Conv. %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {selectedCity.agents.map(a => (
                      <tr key={a.name} className="hover:bg-elevated/50 transition-colors">
                        <td className="px-3 py-2 text-text font-medium">{a.name}</td>
                        <td className="px-3 py-2 text-right text-muted">{a.total}</td>
                        <td className="px-3 py-2 text-right text-muted">{a.interested}</td>
                        <td className="px-3 py-2 text-right text-muted">{a.converted}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={`font-semibold ${
                            a.conversionRate >= 20 ? 'text-status-converted' :
                            a.conversionRate >= 10 ? 'text-status-interested' :
                            a.conversionRate > 0 ? 'text-status-delayed' :
                            'text-dim'
                          }`}>
                            {a.conversionRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-xs text-dim italic">No leads in this city are assigned to any agent yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
