import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { Equipment, EquipmentCategory, EquipmentStatus, PaginationMeta, Technician } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';
import { Pagination } from '../components/common/Pagination';
import { CarbonSelect, type CarbonSelectOption } from '../components/common/CarbonSelect';
import { Search, MapPin, Calendar, QrCode, ExternalLink, RefreshCw } from 'lucide-react';

export const EquipmentListPage: React.FC = () => {
  const navigate = useNavigate();

  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadingPassportId, setLoadingPassportId] = useState<string | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<EquipmentCategory | ''>('');
  const [currentPage, setCurrentPage] = useState(1);

  const fetchEquipment = useCallback(async (page: number) => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '12',
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
      else setError('Failed to load equipment data.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter]);

  useEffect(() => {
    fetchEquipment(currentPage);
  }, [fetchEquipment, currentPage]);

  const handleOpenPassport = async (equipmentId: string) => {
    setLoadingPassportId(equipmentId);
    try {
      const res = await apiClient<{ profileUrl?: string; qrCodeUrl?: string }>(`/api/equipment/${equipmentId}/qr`);
      const profileUrl = res.data?.profileUrl;
      if (profileUrl) {
        const token = profileUrl.split('/equipment/')[1];
        if (token) {
          navigate(`/equipment/${token}`);
          return;
        }
      }
      setError('Could not retrieve QR token for this equipment.');
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('Failed to resolve equipment passport.');
    } finally {
      setLoadingPassportId(null);
    }
  };

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

  // Client-side text search on current page records
  const filteredEquipment = equipmentList.filter((item) => {
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
    if (!dateStr) return 'Not scheduled';
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
      {/* Header Banner */}
      <div className="bg-white text-[#161616] p-6 sm:p-7 rounded-none border border-[#e0e0e0] border-l-4 border-l-[#0f62fe] shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="text-[11px] font-mono font-bold text-[#0f62fe] uppercase tracking-widest block mb-1">
            Plant Operations Register
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#161616]">Equipment Directory</h1>
          <p className="text-[#525252] text-xs sm:text-sm mt-1 max-w-2xl">
            Browse registered machinery, inspect service status, locate assets, and review technician assignments.
          </p>
        </div>
        <button
          onClick={() => fetchEquipment(currentPage)}
          className="self-start md:self-auto flex items-center gap-2 carbon-btn-tertiary text-xs font-semibold"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Register
        </button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white p-4 rounded-none border border-[#e0e0e0] space-y-3 md:space-y-0 md:flex md:items-center md:justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#8d8d8d] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search code, name, manufacturer, model, or location..."
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
        </div>
      </div>

      {error && (
        <div className="p-4 bg-[#fff0f1] border-l-4 border-[#da1e28] text-[#da1e28] text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Equipment View Table / Card Grid */}
      {loading ? (
        <div className="py-20 text-center text-[#525252] text-xs bg-white rounded-none border border-[#e0e0e0]">
          <div className="w-6 h-6 border-2 border-[#0f62fe] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          Loading equipment register...
        </div>
      ) : filteredEquipment.length === 0 ? (
        <div className="py-16 text-center text-[#525252] text-xs bg-white rounded-none border border-[#e0e0e0]">
          No equipment assets match the selected filter criteria.
        </div>
      ) : (
        <>
          {/* Carbon Data Table View (>= 768px) */}
          <div className="hidden md:block bg-white rounded-none border border-[#e0e0e0] overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#e5e5e5] text-[#161616] text-xs font-bold uppercase tracking-wider border-b-2 border-[#8d8d8d]">
                  <th className="py-3 px-4">Equipment Code</th>
                  <th className="py-3 px-4">Equipment Name</th>
                  <th className="py-3 px-4">Category & Model</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Technician</th>
                  <th className="py-3 px-4">Next Maintenance</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e0e0e0] text-xs">
                {filteredEquipment.map((item) => {
                  const locationStr = [item.location?.site, item.location?.building, item.location?.zone]
                    .filter(Boolean)
                    .join(' · ');
                  const techName = getTechnicianName(item.assignedTechnicianId) || item.assignedTechnician?.name;
                  const isOpening = loadingPassportId === item.id;

                  return (
                    <tr key={item.id} className="hover:bg-[#e5e5e5]/50 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-[#161616]">{item.equipmentCode}</td>
                      <td className="py-3.5 px-4 font-semibold text-[#161616]">{item.name}</td>
                      <td className="py-3.5 px-4 text-[#525252]">
                        <span className="font-semibold text-[#161616]">{item.category}</span> · {item.manufacturer} {item.model}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={item.status} isOverdue={item.isOverdue} size="sm" />
                      </td>
                      <td className="py-3.5 px-4 text-[#525252] font-mono text-[11px]">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-[#8d8d8d] shrink-0" />
                          <span className="truncate max-w-[150px]">{locationStr || '—'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {techName ? (
                          <span className="font-medium text-[#161616]">{techName}</span>
                        ) : (
                          <span className="text-[#8d8d8d] italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-[#8d8d8d]" />
                          <span className={item.isOverdue ? 'text-[#da1e28] font-bold' : 'text-[#161616]'}>
                            {formatDate(item.nextMaintenanceDate)}
                          </span>
                        </div>
                        {item.isOverdue && item.daysOverdue && (
                          <span className="text-[10px] text-[#da1e28] font-sans font-bold block">
                            {item.daysOverdue} days overdue
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleOpenPassport(item.id)}
                          disabled={isOpening}
                          className="inline-flex items-center gap-1 bg-[#edf5ff] hover:bg-[#d0e2ff] text-[#0f62fe] px-2.5 py-1 rounded-none text-xs font-semibold transition-colors border border-[#a6c8ff] disabled:opacity-50"
                        >
                          <QrCode className={`w-3.5 h-3.5 ${isOpening ? 'animate-spin' : ''}`} />
                          {isOpening ? 'Opening...' : 'View Profile'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Flat Card Grid View (< 768px) */}
          <div className="md:hidden grid grid-cols-1 gap-3">
            {filteredEquipment.map((item) => {
              const locationStr = [item.location?.site, item.location?.building, item.location?.zone]
                .filter(Boolean)
                .join(' · ');
              const techName = getTechnicianName(item.assignedTechnicianId) || item.assignedTechnician?.name;
              const isOpening = loadingPassportId === item.id;

              return (
                <div
                  key={item.id}
                  className="bg-white p-4 rounded-none border border-[#e0e0e0] space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-[#0f62fe] uppercase tracking-wider block">
                        {item.equipmentCode}
                      </span>
                      <h3 className="font-bold text-[#161616] text-base leading-snug">{item.name}</h3>
                    </div>
                    <StatusBadge status={item.status} isOverdue={item.isOverdue} size="sm" />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-[#525252] pt-2 border-t border-[#f4f4f4]">
                    <div>
                      <span className="text-[#8d8d8d] block text-[10px] uppercase font-bold">Category</span>
                      <span className="font-semibold text-[#161616]">{item.category}</span>
                    </div>
                    <div>
                      <span className="text-[#8d8d8d] block text-[10px] uppercase font-bold">Model</span>
                      <span className="text-[#161616] truncate block">
                        {item.manufacturer} {item.model}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#8d8d8d] block text-[10px] uppercase font-bold">Location</span>
                      <span className="text-[#161616] truncate block font-mono">{locationStr || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[#8d8d8d] block text-[10px] uppercase font-bold">
                        Next Maintenance
                      </span>
                      <span className={`font-mono ${item.isOverdue ? 'text-[#da1e28] font-bold' : 'text-[#161616]'}`}>
                        {formatDate(item.nextMaintenanceDate)}
                      </span>
                    </div>
                  </div>

                  {techName && (
                    <div className="text-xs text-[#525252] pt-1 font-medium">
                      Technician: <strong className="text-[#161616]">{techName}</strong>
                    </div>
                  )}

                  <div className="pt-2 border-t border-[#f4f4f4] flex justify-end">
                    <button
                      onClick={() => handleOpenPassport(item.id)}
                      disabled={isOpening}
                      className="w-full flex items-center justify-center gap-1.5 carbon-btn-primary text-xs font-semibold disabled:opacity-50"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {isOpening ? 'Opening Profile...' : 'Open Asset Profile'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          <Pagination
            meta={pagination}
            currentPage={currentPage}
            onPageChange={(p) => setCurrentPage(p)}
          />
        </>
      )}
    </div>
  );
};
