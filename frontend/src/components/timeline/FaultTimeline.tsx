import React from 'react';
import type { FaultIncident } from '../../types';
import { Calendar, CheckCircle2, ShieldAlert } from 'lucide-react';

interface FaultTimelineProps {
  faults?: FaultIncident[];
  onResolveClick?: (fault: FaultIncident) => void;
  canResolve?: boolean;
}

export const FaultTimeline: React.FC<FaultTimelineProps> = ({
  faults = [],
  onResolveClick,
  canResolve = false,
}) => {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(
        new Date(dateStr)
      );
    } catch {
      return dateStr;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'Critical':
        return 'bg-[#fff0f1] text-[#da1e28] border-[#da1e28] font-bold';
      case 'High':
        return 'bg-[#fcf4d6] text-[#b28600] border-[#f1c21b] font-semibold';
      case 'Medium':
        return 'bg-[#fcf4d6] text-[#b28600] border-[#f1c21b] font-medium';
      case 'Low':
      default:
        return 'bg-[#edf5ff] text-[#0043ce] border-[#0f62fe] font-medium';
    }
  };

  if (!faults.length) {
    return (
      <div className="text-center py-8 px-4 bg-[#f4f4f4] rounded-none border border-dashed border-[#8d8d8d] text-[#525252] text-xs font-['IBM_Plex_Sans',sans-serif]">
        <CheckCircle2 className="w-6 h-6 text-[#24a148] mx-auto mb-2 opacity-80" />
        No fault incidents recorded for this equipment.
      </div>
    );
  }

  return (
    <div className="relative pl-5 border-l-2 border-[#da1e28] space-y-4 my-2 font-['IBM_Plex_Sans',sans-serif]">
      {faults.map((fault, idx) => {
        const isResolved = fault.status === 'Resolved';

        return (
          <div key={fault.id || idx} className="relative group">
            {/* Node Marker */}
            <div
              className={`absolute -left-[27px] top-1.5 w-4 h-4 rounded-none text-white flex items-center justify-center text-[10px] font-mono font-bold ${
                isResolved ? 'bg-[#24a148]' : 'bg-[#da1e28]'
              }`}
            >
              {isResolved ? '✓' : '!'}
            </div>

            <div
              className={`bg-[#ffffff] p-4 rounded-none border transition-colors ${
                isResolved ? 'border-[#e0e0e0]' : 'border-[#ff7eb6] bg-[#fff0f1]/20'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-[#e0e0e0]">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#161616] text-xs">
                    {fault.title || 'Fault Incident'}
                  </span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-none border font-mono ${getSeverityBadge(
                      fault.severity
                    )}`}
                  >
                    {fault.severity} Severity
                  </span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-none border font-mono ${
                      isResolved
                        ? 'bg-[#defbe6] text-[#198038] border-[#24a148]'
                        : 'bg-[#fff0f1] text-[#da1e28] border-[#da1e28] font-bold'
                    }`}
                  >
                    {fault.status}
                  </span>
                </div>

                <div className="flex items-center gap-1 text-xs font-medium text-[#525252] font-mono">
                  <Calendar className="w-3.5 h-3.5 text-[#8d8d8d]" />
                  Logged: {formatDate(fault.reportedDate)}
                </div>
              </div>

              <p className="text-[#393939] text-xs leading-relaxed mb-3 whitespace-pre-line">
                {fault.description}
              </p>

              {isResolved && fault.resolutionNotes && (
                <div className="mt-3 pt-2 border-t border-[#24a148] bg-[#defbe6]/50 p-3 rounded-none text-xs text-[#198038]">
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <CheckCircle2 className="w-4 h-4 text-[#24a148]" />
                    Resolution Record ({formatDate(fault.resolvedAt)}):
                  </div>
                  <p className="whitespace-pre-line text-[#161616]">{fault.resolutionNotes}</p>
                </div>
              )}

              {!isResolved && canResolve && onResolveClick && (
                <div className="mt-3 pt-2 border-t border-[#e0e0e0] flex justify-end">
                  <button
                    onClick={() => onResolveClick(fault)}
                    className="flex items-center gap-1.5 bg-[#198038] hover:bg-[#11662c] text-white px-3 py-1.5 rounded-none text-xs font-medium transition-colors"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Resolve Fault
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
