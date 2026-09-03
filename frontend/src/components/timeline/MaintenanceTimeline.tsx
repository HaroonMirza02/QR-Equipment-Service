import React from 'react';
import type { MaintenanceEvent } from '../../types';
import { Wrench, Calendar, User as UserIcon, Package } from 'lucide-react';

interface MaintenanceTimelineProps {
  events?: MaintenanceEvent[];
}

export const MaintenanceTimeline: React.FC<MaintenanceTimelineProps> = ({ events = [] }) => {
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

  if (!events.length) {
    return (
      <div className="text-center py-8 px-4 bg-[#f4f4f4] rounded-none border border-dashed border-[#8d8d8d] text-[#525252] text-xs font-['IBM_Plex_Sans',sans-serif]">
        <Wrench className="w-6 h-6 text-[#8d8d8d] mx-auto mb-2 opacity-60" />
        No maintenance service records logged for this asset yet.
      </div>
    );
  }

  return (
    <div className="relative pl-5 border-l-2 border-[#0f62fe] space-y-4 my-2 font-['IBM_Plex_Sans',sans-serif]">
      {events.map((event, idx) => (
        <div key={event.id || idx} className="relative group">
          {/* Node marker */}
          <div className="absolute -left-[27px] top-1.5 w-4 h-4 rounded-none bg-[#0f62fe] text-white flex items-center justify-center text-[10px] font-mono font-bold">
            ■
          </div>

          <div className="bg-[#ffffff] p-4 rounded-none border border-[#e0e0e0] hover:border-[#8d8d8d] transition-colors">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-[#e0e0e0]">
              <span className="font-bold text-[#161616] text-xs uppercase tracking-wider">{event.type}</span>
              <div className="flex items-center gap-1 text-xs font-medium text-[#525252] font-mono">
                <Calendar className="w-3.5 h-3.5 text-[#8d8d8d]" />
                {formatDate(event.date)}
              </div>
            </div>

            <p className="text-[#393939] text-xs leading-relaxed mb-3 whitespace-pre-line">
              {event.description}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#525252] pt-2 border-t border-[#f4f4f4]">
              {event.technician?.name ? (
                <div className="flex items-center gap-1.5 text-[#161616] font-medium">
                  <UserIcon className="w-3.5 h-3.5 text-[#0f62fe]" />
                  <span>Technician: {event.technician.name}</span>
                </div>
              ) : (
                <div className="text-[#8d8d8d] italic">Technician unassigned</div>
              )}

              {event.nextRecommendedDate && (
                <div className="text-[#525252] font-mono text-[11px]">
                  Next advised: <strong className="text-[#161616] font-bold">{formatDate(event.nextRecommendedDate)}</strong>
                </div>
              )}
            </div>

            {event.partsUsed && event.partsUsed.length > 0 && (
              <div className="mt-3 pt-2 border-t border-[#e0e0e0] flex items-start gap-2 text-xs text-[#393939] bg-[#f4f4f4] p-2 rounded-none">
                <Package className="w-3.5 h-3.5 text-[#525252] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-[#161616] mr-1">Parts Replaced:</span>
                  <span className="font-mono text-xs">{event.partsUsed.join(' · ')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
