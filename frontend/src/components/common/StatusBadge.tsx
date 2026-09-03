import React from 'react';
import type { EquipmentStatus } from '../../types';

interface StatusBadgeProps {
  status: EquipmentStatus | string;
  isOverdue?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  isOverdue = false,
  size = 'md',
  className = '',
}) => {
  let label = status;
  let colorClasses = 'bg-[#e0e0e0] text-[#525252] border-[#8d8d8d]';
  let dotColor = 'bg-[#8d8d8d]';

  if (status === 'Retired') {
    label = 'Retired';
    colorClasses = 'bg-[#e0e0e0] text-[#525252] border-[#8d8d8d]';
    dotColor = 'bg-[#6f6f6f]';
  } else if (status === 'Replaced') {
    label = 'Replaced';
    colorClasses = 'bg-[#f6f2ff] text-[#6929c4] border-[#8a3ff8]';
    dotColor = 'bg-[#8a3ff8]';
  } else if (status === 'Faulty') {
    label = 'Faulty';
    colorClasses = 'bg-[#fff0f1] text-[#da1e28] border-[#da1e28] font-semibold';
    dotColor = 'bg-[#da1e28]';
  } else if (status === 'Under Maintenance') {
    label = 'Under Maintenance';
    colorClasses = 'bg-[#edf5ff] text-[#0043ce] border-[#0f62fe]';
    dotColor = 'bg-[#0f62fe]';
  } else if (isOverdue) {
    label = 'Operational · Overdue';
    colorClasses = 'bg-[#fcf4d6] text-[#b28600] border-[#f1c21b] font-medium';
    dotColor = 'bg-[#f1c21b]';
  } else if (status === 'Operational') {
    label = 'Operational';
    colorClasses = 'bg-[#defbe6] text-[#198038] border-[#24a148] font-medium';
    dotColor = 'bg-[#24a148]';
  }

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[11px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm font-semibold',
  }[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-none border font-['IBM_Plex_Mono',monospace] ${sizeClasses} ${colorClasses} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden="true" />
      {label}
    </span>
  );
};
