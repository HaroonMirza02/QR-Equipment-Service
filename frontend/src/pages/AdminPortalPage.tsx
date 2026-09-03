import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import type { Equipment, EquipmentCategory, EquipmentStatus, PaginationMeta, Technician, FaultIncident } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';
import { Pagination } from '../components/common/Pagination';
import { CarbonSelect, type CarbonSelectOption } from '../components/common/CarbonSelect';
import { Toast } from '../components/common/Toast';
import { EquipmentModal } from '../components/modals/EquipmentModal';
import { MaintenanceModal } from '../components/modals/MaintenanceModal';
import { FaultModal } from '../components/modals/FaultModal';
import { RetireModal } from '../components/modals/RetireModal';
import { ReplaceModal } from '../components/modals/ReplaceModal';
import { QRManagerModal } from '../components/modals/QRManagerModal';
import {
  Plus,
  Search,
  Wrench,
  AlertTriangle,
  QrCode,
  Edit2,
  Trash2,
  ArrowRightLeft,
  RefreshCw,
  Cpu,
  CheckCircle2,
  Clock,
  ShieldAlert,
} from 'lucide-react';

export const AdminPortalPage: React.FC = () => {
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState<{ msg: string; isError?: boolean } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<EquipmentCategory | ''>('');
  const [currentPage, setCurrentPage] = useState(1);

  // Modal States
  const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);

  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [maintenanceEquipment, setMaintenanceEquipment] = useState<Equipment | null>(null);

  const [isFaultModalOpen, setIsFaultModalOpen] = useState(false);
  const [faultEquipment, setFaultEquipment] = useState<Equipment | null>(null);
  const [resolvingFault, setResolvingFault] = useState<FaultIncident | null>(null);

  const [isRetireModalOpen, setIsRetireModalOpen] = useState(false);
  const [retireEquipment, setRetireEquipment] = useState<Equipment | null>(null);

  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);
  const [replaceEquipment, setReplaceEquipment] = useState<Equipment | null>(null);

  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [selectedQRData, setSelectedQRData] = useState<{
    id: string;
    equipmentCode: string;
    name: string;
    qrCodeUrl: string;
    profileUrl: string;
  } | null>(null);

  const fetchPortalData = useCallback(async (page: number) => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '10',
      });
      if (statusFilter) params.append('status', statusFilter);
      if (categoryFilter) params.append('category', categoryFilter);

      const [equipRes, techRes] = await Promise.all([
        apiClient<Equipment[]>(`/api/equipment?${params}`),
        apiClient<Technician[]>('/api/technicians?pageSize=100&status=active').catch(() => ({
          success: true,
          data: [],
        })),
      ]);

      setEquipmentList(equipRes.data || []);
      setPagination(equipRes.pagination || {});
      setTechnicians(techRes.data || []);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('Failed to load portal data.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter]);

  useEffect(() => {
    fetchPortalData(currentPage);
  }, [fetchPortalData, currentPage]);

  const statusOptions: CarbonSelectOption[] = [
    { value: '', label: 'All Statuses' },
    { value: 'Operational', label: 'Operational' },
    { value: 'Under Maintenance', label: 'Under Maintenance' },
    { value: 'Faulty', label: 'Faulty' },
    { value: 'Retired', label: 'Retired' },
  ];

  const categoryOptions: CarbonSelectOption[] = [
    { value: '', label: 'All Categories' },
    { value: 'Pump', label: 'Pumps' },
    { value: 'Generator', label: 'Generators' },
    { value: 'Compressor', label: 'Compressors' },
    { value: 'HVAC', label: 'HVAC' },
    { value: 'Electrical', label: 'Electrical' },
    { value: 'Other', label: 'Other' },
  ];

  // Calculations for Metric Tiles
  const totalCount = pagination.totalCount || equipmentList.length;
  const operationalCount = equipmentList.filter((e) => e.status === 'Operational' && !e.isOverdue).length;
  const attentionCount = equipmentList.filter((e) => e.status === 'Faulty' || e.isOverdue).length;
  const maintenanceCount = equipmentList.filter((e) => e.status === 'Under Maintenance').length;

  // Save / Update Equipment
  const handleSaveEquipment = async (payload: Partial<Equipment>) => {
    if (editingEquipment) {
      await apiClient(`/api/equipment/${editingEquipment.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setToastMessage({ msg: `Equipment '${payload.equipmentCode}' updated successfully.` });
    } else {
      await apiClient('/api/equipment', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setToastMessage({ msg: `New equipment '${payload.equipmentCode}' created & QR issued!` });
    }
    fetchPortalData(currentPage);
  };

  // Log Maintenance Event
  const handleLogMaintenance = async (equipmentId: string, payload: unknown) => {
    await apiClient(`/api/equipment/${equipmentId}/maintenance`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setToastMessage({ msg: 'Maintenance service log recorded successfully.' });
    fetchPortalData(currentPage);
  };

  // Report Fault Incident
  const handleReportFault = async (equipmentId: string, payload: unknown) => {
    await apiClient(`/api/equipment/${equipmentId}/faults`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setToastMessage({ msg: 'Fault incident reported; equipment marked Faulty.', isError: true });
    fetchPortalData(currentPage);
  };

  // Resolve Fault Incident
  const handleResolveFault = async (faultId: string, resolutionNotes: string) => {
    await apiClient(`/api/faults/${faultId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolutionNotes }),
    });
    setToastMessage({ msg: 'Fault marked as resolved.' });
    fetchPortalData(currentPage);
  };

  // Retire Equipment
  const handleRetireEquipment = async (equipmentId: string, reason: string) => {
    await apiClient(`/api/equipment/${equipmentId}/retire`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    setToastMessage({ msg: 'Equipment decommissioned and retired.', isError: true });
    fetchPortalData(currentPage);
  };

  // Replace Equipment
  const handleReplaceEquipment = async (
    equipmentId: string,
    payload: { replacementEquipmentId: string; reason?: string }
  ) => {
    await apiClient(`/api/equipment/${equipmentId}/replace`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setToastMessage({ msg: 'Asset replaced and successor linked.' });
    fetchPortalData(currentPage);
  };

  // View or Regenerate QR (Dynamically fetch QR URL & token from API)
  const handleViewQR = async (item: Equipment) => {
    try {
      const res = await apiClient<{
        equipmentCode: string;
        name: string;
        qrCodeUrl: string;
        profileUrl: string;
      }>(`/api/equipment/${item.id}/qr`);

      setSelectedQRData({
        id: item.id,
        equipmentCode: res.data.equipmentCode || item.equipmentCode,
        name: res.data.name || item.name,
        qrCodeUrl: res.data.qrCodeUrl,
        profileUrl: res.data.profileUrl,
      });
      setIsQRModalOpen(true);
    } catch (err) {
      if (err instanceof Error) setToastMessage({ msg: err.message, isError: true });
      else setToastMessage({ msg: 'Failed to retrieve QR details', isError: true });
    }
  };

  const handleRegenerateQR = async (equipmentId: string) => {
    const res = await apiClient<{ qrCodeUrl: string }>(`/api/equipment/${equipmentId}/qr/regenerate`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Regenerated via Admin Portal' }),
    });
    setToastMessage({ msg: 'QR code invalidated & regenerated successfully.' });
    if (selectedQRData) {
      setSelectedQRData({ ...selectedQRData, qrCodeUrl: res.data.qrCodeUrl });
    }
    fetchPortalData(currentPage);
  };

  // Client-side search filter
  const filteredList = equipmentList.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const haystack = [
      item.equipmentCode,
      item.name,
      item.manufacturer,
      item.model,
      item.location?.site,
      item.location?.building,
      item.location?.zone,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });

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

  const getTechnicianName = (techId?: string | null) => {
    if (!techId) return null;
    const tech = technicians.find((t) => t.id === techId);
    return tech ? tech.name : null;
  };

  return (
    <div className="min-h-screen bg-[#f4f4f4] py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6 font-['IBM_Plex_Sans',sans-serif]">
      {/* Carbon Admin Banner Header */}
      <div className="bg-white text-[#161616] p-6 sm:p-7 rounded-none border border-[#e0e0e0] border-l-4 border-l-[#0f62fe] shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="text-[11px] font-mono font-bold text-[#0f62fe] uppercase tracking-widest block mb-1">
            Plant Operations Console
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#161616]">Equipment Control Portal</h1>
          <p className="text-[#525252] text-xs sm:text-sm mt-1 max-w-2xl">
            Register machinery, record maintenance logs, report fault incidents, manage QR tokens, and handle lifecycle replacements.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingEquipment(null);
            setIsEquipmentModalOpen(true);
          }}
          className="self-start md:self-auto flex items-center gap-2 carbon-btn-primary text-xs sm:text-sm font-semibold"
        >
          <Plus className="w-4 h-4" />
          Add Equipment Asset
        </button>
      </div>

      {/* Carbon Metric Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 font-['IBM_Plex_Sans',sans-serif]">
        <div className="bg-white p-4 rounded-none border border-[#e0e0e0]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#525252]">
              Total Registered
            </span>
            <Cpu className="w-4 h-4 text-[#0f62fe]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#161616] mt-1">{totalCount}</div>
          <span className="text-[11px] text-[#525252] block truncate">Current page inventory</span>
        </div>

        <div className="bg-white p-4 rounded-none border border-[#e0e0e0]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#198038]">
              Operational
            </span>
            <CheckCircle2 className="w-4 h-4 text-[#24a148]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#198038] mt-1">
            {operationalCount}
          </div>
          <span className="text-[11px] text-[#525252] block truncate">In active service</span>
        </div>

        <div className="bg-white p-4 rounded-none border border-[#e0e0e0]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#da1e28]">
              Needs Attention
            </span>
            <AlertTriangle className="w-4 h-4 text-[#da1e28]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#da1e28] mt-1">
            {attentionCount}
          </div>
          <span className="text-[11px] text-[#525252] block truncate">Faulty or Overdue</span>
        </div>

        <div className="bg-white p-4 rounded-none border border-[#e0e0e0]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#0043ce]">
              In Maintenance
            </span>
            <Clock className="w-4 h-4 text-[#0f62fe]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#0043ce] mt-1">
            {maintenanceCount}
          </div>
          <span className="text-[11px] text-[#525252] block truncate">Work in progress</span>
        </div>
      </div>

      {/* Filter & Action Toolbar */}
      <div className="bg-white p-4 rounded-none border border-[#e0e0e0] space-y-3 md:space-y-0 md:flex md:items-center md:justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#8d8d8d] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search code, name, manufacturer, model, or site..."
            className="carbon-input w-full !pl-10"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="w-44">
            <CarbonSelect
              options={statusOptions}
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val as EquipmentStatus | '');
                setCurrentPage(1);
              }}
              size="sm"
            />
          </div>

          <div className="w-44">
            <CarbonSelect
              options={categoryOptions}
              value={categoryFilter}
              onChange={(val) => {
                setCategoryFilter(val as EquipmentCategory | '');
                setCurrentPage(1);
              }}
              size="sm"
            />
          </div>

          <button
            onClick={() => fetchPortalData(currentPage)}
            className="p-2 carbon-btn-secondary text-xs"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-[#fff0f1] border-l-4 border-[#da1e28] text-[#da1e28] text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Carbon Data Table View */}
      {loading ? (
        <div className="py-20 text-center text-[#525252] text-xs bg-white rounded-none border border-[#e0e0e0]">
          <div className="w-6 h-6 border-2 border-[#0f62fe] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          Loading equipment control registry...
        </div>
      ) : filteredList.length === 0 ? (
        <div className="py-16 text-center text-[#525252] text-xs bg-white rounded-none border border-[#e0e0e0]">
          No equipment records match the selected filter criteria.
        </div>
      ) : (
        <div className="bg-white rounded-none border border-[#e0e0e0] overflow-hidden">
          {/* Desktop Carbon Data Table (>= 1024px) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#e5e5e5] text-[#161616] text-xs font-bold uppercase tracking-wider border-b-2 border-[#8d8d8d]">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Equipment Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Condition</th>
                  <th className="py-3 px-4">Technician</th>
                  <th className="py-3 px-4">Next Due</th>
                  <th className="py-3 px-4 text-center">QR Token</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e0e0e0] text-xs">
                {filteredList.map((item) => {
                  const techName = getTechnicianName(item.assignedTechnicianId) || item.assignedTechnician?.name;
                  const isRetired = item.status === 'Retired';

                  return (
                    <tr key={item.id} className="hover:bg-[#e5e5e5]/50 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-[#161616]">{item.equipmentCode}</td>
                      <td className="py-3.5 px-4">
                        <strong className="font-semibold text-[#161616] block">{item.name}</strong>
                        <span className="text-[11px] text-[#525252]">
                          {item.manufacturer} · {item.model}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[#161616]">{item.category}</td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={item.status} isOverdue={item.isOverdue} size="sm" />
                      </td>
                      <td className="py-3.5 px-4">
                        {techName ? (
                          <span className="font-medium text-[#161616]">{techName}</span>
                        ) : (
                          <span className="text-[#8d8d8d] italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <span className={item.isOverdue ? 'text-[#da1e28] font-bold' : 'text-[#161616]'}>
                          {formatDate(item.nextMaintenanceDate)}
                        </span>
                        {item.isOverdue && item.daysOverdue && (
                          <span className="text-[10px] text-[#da1e28] font-sans font-bold block">
                            {item.daysOverdue}d overdue
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleViewQR(item)}
                          className="inline-flex items-center gap-1 bg-[#f4f4f4] hover:bg-[#e5e5e5] text-[#161616] px-2 py-1 border border-[#8d8d8d] text-[11px] font-mono font-semibold"
                        >
                          <QrCode className="w-3.5 h-3.5 text-[#0f62fe]" />
                          View QR
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1 whitespace-nowrap">
                        {!isRetired && (
                          <>
                            <button
                              onClick={() => {
                                setEditingEquipment(item);
                                setIsEquipmentModalOpen(true);
                              }}
                              className="p-1.5 text-[#0f62fe] hover:bg-[#edf5ff] rounded-none border border-transparent hover:border-[#a6c8ff]"
                              title="Edit Asset Details"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => {
                                setMaintenanceEquipment(item);
                                setIsMaintenanceModalOpen(true);
                              }}
                              className="p-1.5 text-[#198038] hover:bg-[#defbe6] rounded-none border border-transparent hover:border-[#24a148]"
                              title="Log Maintenance Service"
                            >
                              <Wrench className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => {
                                setFaultEquipment(item);
                                setResolvingFault(null);
                                setIsFaultModalOpen(true);
                              }}
                              className="p-1.5 text-[#da1e28] hover:bg-[#fff0f1] rounded-none border border-transparent hover:border-[#da1e28]"
                              title="Report Fault Incident"
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => {
                                setReplaceEquipment(item);
                                setIsReplaceModalOpen(true);
                              }}
                              className="p-1.5 text-[#6929c4] hover:bg-[#f6f2ff] rounded-none border border-transparent hover:border-[#8a3ff8]"
                              title="Replace Equipment"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => {
                                setRetireEquipment(item);
                                setIsRetireModalOpen(true);
                              }}
                              className="p-1.5 text-[#525252] hover:bg-[#e0e0e0] rounded-none border border-transparent hover:border-[#8d8d8d]"
                              title="Retire Asset"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Grid View (< 1024px) */}
          <div className="lg:hidden divide-y divide-[#e0e0e0]">
            {filteredList.map((item) => {
              const techName = getTechnicianName(item.assignedTechnicianId) || item.assignedTechnician?.name;
              const isRetired = item.status === 'Retired';

              return (
                <div key={item.id} className="p-4 space-y-3 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-[#0f62fe] uppercase block">
                        {item.equipmentCode}
                      </span>
                      <h3 className="font-bold text-[#161616] text-base leading-snug">{item.name}</h3>
                      <p className="text-xs text-[#525252]">
                        {item.category} · {item.manufacturer} {item.model}
                      </p>
                    </div>
                    <StatusBadge status={item.status} isOverdue={item.isOverdue} size="sm" />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-[#525252] pt-2 border-t border-[#f4f4f4]">
                    <div>
                      <span className="text-[#8d8d8d] block text-[10px] uppercase font-bold">Technician</span>
                      <span className="font-semibold text-[#161616]">{techName || 'Unassigned'}</span>
                    </div>
                    <div>
                      <span className="text-[#8d8d8d] block text-[10px] uppercase font-bold">Next Maintenance</span>
                      <span className={`font-mono ${item.isOverdue ? 'text-[#da1e28] font-bold' : 'text-[#161616]'}`}>
                        {formatDate(item.nextMaintenanceDate)}
                      </span>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#f4f4f4]">
                    <button
                      onClick={() => handleViewQR(item)}
                      className="flex items-center gap-1 bg-[#f4f4f4] text-[#161616] px-2.5 py-1 text-xs font-mono font-semibold border border-[#8d8d8d]"
                    >
                      <QrCode className="w-3.5 h-3.5 text-[#0f62fe]" />
                      Physical Label
                    </button>

                    {!isRetired && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingEquipment(item);
                            setIsEquipmentModalOpen(true);
                          }}
                          className="px-2 py-1 bg-[#edf5ff] text-[#0f62fe] text-xs font-semibold"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setMaintenanceEquipment(item);
                            setIsMaintenanceModalOpen(true);
                          }}
                          className="px-2 py-1 bg-[#defbe6] text-[#198038] text-xs font-semibold"
                        >
                          Log Service
                        </button>
                        <button
                          onClick={() => {
                            setFaultEquipment(item);
                            setResolvingFault(null);
                            setIsFaultModalOpen(true);
                          }}
                          className="px-2 py-1 bg-[#fff0f1] text-[#da1e28] text-xs font-semibold"
                        >
                          Fault
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Data Table Pagination */}
          <Pagination
            meta={pagination}
            currentPage={currentPage}
            onPageChange={(p) => setCurrentPage(p)}
          />
        </div>
      )}

      {/* Modal Dialogs */}
      <EquipmentModal
        isOpen={isEquipmentModalOpen}
        onClose={() => setIsEquipmentModalOpen(false)}
        onSave={handleSaveEquipment}
        equipment={editingEquipment}
        technicians={technicians}
      />

      <MaintenanceModal
        isOpen={isMaintenanceModalOpen}
        onClose={() => setIsMaintenanceModalOpen(false)}
        onSave={handleLogMaintenance}
        equipment={maintenanceEquipment}
        technicians={technicians}
      />

      <FaultModal
        isOpen={isFaultModalOpen}
        onClose={() => setIsFaultModalOpen(false)}
        onReportFault={handleReportFault}
        onResolveFault={handleResolveFault}
        equipment={faultEquipment}
        resolvingFault={resolvingFault}
      />

      <RetireModal
        isOpen={isRetireModalOpen}
        onClose={() => setIsRetireModalOpen(false)}
        onRetire={handleRetireEquipment}
        equipment={retireEquipment}
      />

      <ReplaceModal
        isOpen={isReplaceModalOpen}
        onClose={() => setIsReplaceModalOpen(false)}
        onReplace={handleReplaceEquipment}
        equipment={replaceEquipment}
        allEquipment={equipmentList}
      />

      <QRManagerModal
        isOpen={isQRModalOpen}
        onClose={() => setIsQRModalOpen(false)}
        qrData={selectedQRData}
        onRegenerate={handleRegenerateQR}
      />

      {/* Carbon Toast Banner */}
      {toastMessage && (
        <Toast
          message={toastMessage.msg}
          isError={toastMessage.isError}
          onClose={() => setToastMessage(null)}
        />
      )}
    </div>
  );
};
