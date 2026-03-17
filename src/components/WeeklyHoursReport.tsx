import { format, parseISO } from "date-fns";
import type { WeeklySummary, WeeklyHourRow } from "@/hooks/useWeeklyHours";
import {
  fmtHHMM, fmtHMshort, TARGET_WEEKLY_MINUTES,
  TIER_STYLES, TIER_BADGE, TIER_LABEL,
  LATE_THRESHOLD_MIN
} from "@/hooks/useWeeklyHours";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function DayCell({ day }: { day: WeeklyHourRow["days"][0] }) {
  if (day.isWeeklyOff) {
    return <td className="px-1.5 py-1 text-center bg-muted/40 text-muted-foreground text-xs font-medium">OFF</td>;
  }
  if (day.isAbsent) {
    return <td className="px-1.5 py-1 text-center bg-red-50 text-red-500 text-xs font-bold">—</td>;
  }
  if (!day.workMinutes) {
    return <td className="px-1.5 py-1 text-center text-muted-foreground text-xs">·</td>;
  }

  let cellBg = "";
  let textColor = "text-foreground";
  if (day.isLate) { cellBg = "bg-red-50"; textColor = "text-red-700"; }
  else if (day.isEarlyLeaving) { cellBg = "bg-amber-50"; textColor = "text-amber-700"; }
  else if (day.isShortDay) { cellBg = "bg-orange-50"; textColor = "text-orange-700"; }

  return (
    <td className={`px-1.5 py-1 text-center ${cellBg}`}>
      <div className={`text-xs font-semibold ${textColor}`}>{day.label}</div>
      {day.isLate && (
        <div className="text-[10px] font-bold text-red-600 leading-tight">
          LATE +{fmtHMshort(day.lateByMinutes)}
        </div>
      )}
      {!day.isLate && day.isEarlyLeaving && (
        <div className="text-[10px] text-amber-600 leading-tight">
          -{fmtHMshort(day.earlyGoingMinutes)}
        </div>
      )}
    </td>
  );
}

function RowBadge({ tier }: { tier: WeeklyHourRow["tier"] }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${TIER_BADGE[tier]}`}>
      {TIER_LABEL[tier]}
    </span>
  );
}

interface Props {
  summaries: WeeklySummary[];
  monthYear: string;
}

export function WeeklyHoursReport({ summaries, monthYear }: Props) {
  if (summaries.length === 0) return null;
  const monthLabel = format(parseISO(monthYear + "-01"), "MMMM yyyy");

  return (
    <div id="weekly-hours-report" className="space-y-8 print:space-y-4">
      {/* Page header */}
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-foreground">Weekly Hours Report — {monthLabel}</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>🎯 Target: 54 hrs/week (incl. 1hr lunch/day, 6 days)</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-200" /> ≥54h On Track
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-amber-50 border border-amber-200" /> 48–53h Slightly Short
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-orange-100 border border-orange-300" /> 40–47h Short
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-red-100 border border-red-300" /> &lt;40h Critical
          </span>
          <span>🔴 Red cell = Late arrival (&gt;{LATE_THRESHOLD_MIN} min)</span>
        </div>
      </div>

      {summaries.map(week => (
        <div key={week.weekStart} className="space-y-3 break-inside-avoid">
          {/* Week header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-2">
            <div>
              <h3 className="text-base font-bold text-foreground">{week.label}</h3>
              <p className="text-xs text-muted-foreground">
                {week.rows.length} employees · {week.atRiskCount > 0 ? `${week.atRiskCount} need attention` : "All on track"}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              {week.totalLateCount > 0 && (
                <span className="text-red-600 font-medium">
                  {week.totalLateCount} late arrival{week.totalLateCount > 1 ? "s" : ""}
                </span>
              )}
              {week.totalShortfallMinutes > 0 && (
                <span className="text-orange-600 font-medium">
                  Total shortfall: {fmtHHMM(week.totalShortfallMinutes)}
                </span>
              )}
            </div>
          </div>

          {/* Main table */}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-semibold text-xs">Employee</th>
                  <th className="text-left p-2 font-semibold text-xs">Dept</th>
                  {DAY_LABELS.map(d => (
                    <th key={d} className="text-center p-1 font-semibold text-xs w-14">{d}</th>
                  ))}
                  <th className="text-center p-2 font-semibold text-xs">Worked</th>
                  <th className="text-center p-2 font-semibold text-xs">Status</th>
                  <th className="text-center p-2 font-semibold text-xs">vs 54h</th>
                  <th className="text-center p-2 font-semibold text-xs">Late</th>
                </tr>
              </thead>
              <tbody>
                {week.rows.map((row, i) => {
                  const pct = Math.min(100, Math.round((row.workedMinutes / TARGET_WEEKLY_MINUTES) * 100));
                  const rowBg = row.tier === "red" ? "bg-red-50/50" : row.tier === "orange" ? "bg-orange-50/50" : "";
                  return (
                    <tr key={`${row.code}-${i}`} className={`border-b last:border-0 ${rowBg}`}>
                      <td className="p-2">
                        <div className="font-medium text-xs">{row.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{row.code}</div>
                      </td>
                      <td className="p-2 text-xs">{row.department}</td>
                      {row.days.map((day, di) => (
                        <DayCell key={di} day={day} />
                      ))}
                      <td className="p-2 text-center">
                        <div className="text-xs font-semibold">{row.workedMinutes > 0 ? fmtHHMM(row.workedMinutes) : "—"}</div>
                        {row.workedMinutes > 0 && (
                          <div className="w-16 mx-auto h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${row.tier === "green" ? "bg-green-500" : row.tier === "amber" ? "bg-amber-400" : "bg-red-400"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {row.workedMinutes > 0 ? <RowBadge tier={row.tier} /> : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="p-2 text-center text-xs font-medium">
                        {row.workedMinutes > 0 ? `${row.delta >= 0 ? "+" : ""}${fmtHHMM(row.delta)}` : "—"}
                      </td>
                      <td className="p-2 text-center">
                        {row.lateCount > 0 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                            {row.lateCount}
                          </span>
                        ) : (
                          <span className="text-green-600 text-xs">✓</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* "Needs Attention" callout */}
          {week.atRiskCount > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
              <p className="text-sm font-semibold text-red-800">
                🚨 {week.atRiskCount} employee{week.atRiskCount > 1 ? "s" : ""} need a conversation this week:
              </p>
              <div className="flex flex-wrap gap-3">
                {week.rows
                  .filter(r => r.tier === "orange" || r.tier === "red")
                  .map(r => (
                    <span key={r.code} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${TIER_STYLES[r.tier]}`}>
                      <span className="font-semibold">{r.name}</span>
                      <span className="text-muted-foreground">({r.code})</span>
                      <span>{fmtHHMM(r.workedMinutes)}</span>
                      {r.lateCount > 0 && (
                        <span className="text-red-600 font-bold">
                          {r.lateCount}× late
                        </span>
                      )}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
