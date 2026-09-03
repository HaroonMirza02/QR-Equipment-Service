export type EquipmentStatus = 'Operational' | 'Under Maintenance' | 'Faulty' | 'Retired';

export type EquipmentCategory = 'Pump' | 'Generator' | 'Compressor' | 'HVAC' | 'Electrical' | 'Other';

export type UserRole = 'Admin' | 'Technician' | 'Viewer';

export interface LocationInfo {
  site?: string;
  building?: string;
  zone?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId?: string;
}

export interface Technician {
  id: string;
  name: string;
  email: string;
  phone?: string;
  specialty?: string;
  status: 'active' | 'inactive';
}

export interface Equipment {
  id: string;
  equipmentCode: string;
  name: string;
  category: EquipmentCategory;
  status: EquipmentStatus;
  isOverdue?: boolean;
  daysOverdue?: number;
  manufacturer: string;
  model: string;
  serialNumber?: string;
  location?: LocationInfo;
  installationDate?: string;
  lastMaintenanceDate?: string;
  nextMaintenanceDate?: string;
  maintenanceIntervalDays?: number;
  assignedTechnicianId?: string | null;
  assignedTechnician?: Technician | null;
  isPublicVisible?: boolean;
  notes?: string;
  replacedByEquipmentId?: string | null;
  replacesEquipmentId?: string | null;
  qrToken?: string;
  qrCodeUrl?: string;
  profileUrl?: string;
}

export interface MaintenanceEvent {
  id: string;
  equipmentId: string;
  performedByTechnicianId?: string;
  technician?: {
    id?: string;
    name: string;
    specialty?: string;
  };
  type: string;
  date: string;
  description: string;
  partsUsed?: string[];
  nextRecommendedDate?: string;
}

export interface FaultIncident {
  id: string;
  equipmentId: string;
  reportedByUserId?: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  status: 'Open' | 'Investigating' | 'Resolved';
  title?: string;
  description: string;
  reportedDate: string;
  resolvedAt?: string;
  resolutionNotes?: string;
}

export interface PassportData extends Equipment {
  maintenanceHistory?: MaintenanceEvent[];
  faultHistory?: FaultIncident[];
  maintenanceSummary?: {
    totalCount: number;
    lastMaintenanceDate?: string;
    lastMaintenanceType?: string;
  };
  faultSummary?: {
    openCount: number;
    highestOpenSeverity?: string;
  };
  successor?: {
    equipmentCode: string;
    name: string;
    profileUrl: string;
  };
  message?: string;
}

export interface PaginationMeta {
  totalCount?: number;
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  pages?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  pagination?: PaginationMeta;
  error?: {
    code: string;
    message: string;
    details?: Array<{ field?: string; message: string }>;
  };
}
