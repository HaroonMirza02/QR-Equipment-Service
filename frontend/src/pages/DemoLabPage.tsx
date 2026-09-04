import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, resolveImageUrl, resolveProfileUrl } from '../api/client';
import type { Equipment, EquipmentCategory, PaginationMeta } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';
import { Pagination } from '../components/common/Pagination';
import { CarbonSelect, type CarbonSelectOption } from '../components/common/CarbonSelect';
import { Printer, QrCode, ExternalLink } from 'lucide-react';

export const DemoLabPage: React.FC = () => {
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeFilter, setActiveFilter] = useState<'all' | 'attention' | 'lifecycle'>('all');
  const [currentCategory, setCurrentCategory] = useState<EquipmentCategory | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const fetchDemoEquipment = useCallback(async (page: number) => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '12',
      });
      if (currentCategory !== 'all') params.append('category', currentCategory);

      const res = await apiClient<{ data: Equipment[]; total: number; pages: number; page: number }>(
        `/api/public/demo-equipment?${params}`
      );

      const payloadData = res.data as unknown as {
        data: Equipment[];
        total: number;
        pages: number;
        page: number;
      };

      const items = Array.isArray(payloadData.data) ? payloadData.data : Array.isArray(res.data) ? res.data : [];
      setEquipmentList(items);

      setPagination({
        totalCount: payloadData.total || items.length,
        totalPages: payloadData.pages || 1,
        page: payloadData.page || page,
      });
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('Demo label directory is unavailable in this environment.');
    } finally {
      setLoading(false);
    }
  }, [currentCategory]);

  useEffect(() => {
    fetchDemoEquipment(currentPage);
  }, [fetchDemoEquipment, currentPage]);

  const categoryOptions: CarbonSelectOption[] = [
    { value: 'all', label: 'All Categories' },
    { value: 'Pump', label: 'Pumps' },
    { value: 'Generator', label: 'Generators' },
    { value: 'Compressor', label: 'Compressors' },
    { value: 'HVAC', label: 'HVAC' },
    { value: 'Electrical', label: 'Electrical' },
    { value: 'Other', label: 'Other' },
  ];

  const getLabelPresentation = (item: Equipment) => {
    if (item.status === 'Retired') return { group: 'lifecycle', label: 'Retired Label' };
    if (item.status === 'Faulty') return { group: 'attention', label: 'Faulty · Isolate' };
    if (item.status === 'Under Maintenance') return { group: 'attention', label: 'Under Maintenance' };
    if (item.isOverdue) return { group: 'attention', label: `${item.daysOverdue || 0} days overdue` };
    return { group: 'normal', label: 'Operational' };
  };

  const filteredLabels = equipmentList.filter((item) => {
    if (activeFilter === 'all') return true;
    const group = getLabelPresentation(item).group;
    return group === activeFilter;
  });

  return (
    <div className="min-h-screen bg-[#f4f4f4] py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6 font-['IBM_Plex_Sans',sans-serif]">
      {/* Header Banner */}
      <div className="bg-[#161616] text-white p-6 sm:p-8 rounded-none border border-[#393939] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="text-[11px] font-mono font-bold text-[#78a9ff] uppercase tracking-widest block mb-1">
            Industrial Equipment Demo Suite
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Physical QR Label Lab
          </h1>
          <p className="text-[#a8a8a8] text-xs sm:text-sm mt-1 max-w-2xl">
            A focused set of operational, overdue, faulty, under-maintenance, and retired equipment labels for camera scanning and physical print testing.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="no-print flex items-center gap-2 carbon-btn-primary font-semibold text-xs sm:text-sm self-start md:self-auto"
        >
          <Printer className="w-4 h-4" />
          Print Test Sheet
        </button>
      </div>

      {/* Carbon Guidance Strip */}
      <div className="no-print grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-5 rounded-none border border-[#e0e0e0]">
        <div className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-none bg-[#161616] text-[#78a9ff] font-bold font-mono flex items-center justify-center text-xs shrink-0">
            01
          </span>
          <div>
            <strong className="text-xs font-bold text-[#161616] uppercase tracking-wider block">
              Print at 100% Scale
            </strong>
            <p className="text-xs text-[#525252]">Keep the printed QR at least 30 mm wide for optical camera scanning.</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-none bg-[#161616] text-[#78a9ff] font-bold font-mono flex items-center justify-center text-xs shrink-0">
            02
          </span>
          <div>
            <strong className="text-xs font-bold text-[#161616] uppercase tracking-wider block">
              Scan at Working Distance
            </strong>
            <p className="text-xs text-[#525252]">Test mobile phone camera scanning at 20–80 cm distance.</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-none bg-[#161616] text-[#78a9ff] font-bold font-mono flex items-center justify-center text-xs shrink-0">
            03
          </span>
          <div>
            <strong className="text-xs font-bold text-[#161616] uppercase tracking-wider block">
              Verify Asset Profile
            </strong>
            <p className="text-xs text-[#525252]">
              Confirm scannable mobile equipment passport matches physical printed code.
            </p>
          </div>
        </div>
      </div>

      {/* Carbon Filter Toolbar */}
      <div className="no-print bg-white p-4 rounded-none border border-[#e0e0e0] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#525252] uppercase tracking-wider">State Filter:</span>
          <div className="inline-flex bg-[#f4f4f4] p-1 rounded-none text-xs font-semibold border border-[#e0e0e0]">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-none transition-colors ${
                activeFilter === 'all' ? 'bg-[#161616] text-white font-bold' : 'text-[#525252]'
              }`}
            >
              All Labels
            </button>
            <button
              onClick={() => setActiveFilter('attention')}
              className={`px-3 py-1.5 rounded-none transition-colors ${
                activeFilter === 'attention' ? 'bg-[#da1e28] text-white font-bold' : 'text-[#525252]'
              }`}
            >
              Attention Required
            </button>
            <button
              onClick={() => setActiveFilter('lifecycle')}
              className={`px-3 py-1.5 rounded-none transition-colors ${
                activeFilter === 'lifecycle' ? 'bg-[#6929c4] text-white font-bold' : 'text-[#525252]'
              }`}
            >
              Lifecycle States
            </button>
          </div>
        </div>

        <div className="w-48">
          <CarbonSelect
            options={categoryOptions}
            value={currentCategory}
            onChange={(val) => {
              setCurrentCategory(val as EquipmentCategory | 'all');
              setCurrentPage(1);
            }}
            size="sm"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-[#fff0f1] border-l-4 border-[#da1e28] text-[#da1e28] text-xs font-semibold">
          {error}
        </div>
      )}

      {/* QR Label Card Grid */}
      {loading ? (
        <div className="py-20 text-center text-[#525252] text-xs bg-white rounded-none border border-[#e0e0e0]">
          <div className="w-6 h-6 border-2 border-[#0f62fe] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          Preparing QR test labels...
        </div>
      ) : filteredLabels.length === 0 ? (
        <div className="py-16 text-center text-[#525252] text-xs bg-white rounded-none border border-[#e0e0e0]">
          No QR labels match the selected filter criteria.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 print-only-grid">
            {filteredLabels.map((item) => {
              const locationStr = [item.location?.site, item.location?.building, item.location?.zone]
                .filter(Boolean)
                .join(' · ');
              const resolvedQr = resolveImageUrl(item.qrCodeUrl);

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-none border border-[#e0e0e0] overflow-hidden flex flex-col justify-between qr-label-card font-['IBM_Plex_Sans',sans-serif]"
                >
                  <div className="p-5 flex items-start gap-4">
                    {/* Physical QR Image Container */}
                    <div className="w-28 h-28 bg-[#161616] p-2 rounded-none shrink-0 border border-[#393939] flex flex-col items-center justify-center text-center">
                      {resolvedQr ? (
                        <img
                          src={resolvedQr}
                          alt={`QR code for ${item.equipmentCode}`}
                          className="w-full h-full object-contain bg-white p-1 rounded-none"
                        />
                      ) : (
                        <QrCode className="w-14 h-14 text-white" />
                      )}
                      <span className="text-[9px] text-[#a8a8a8] font-mono mt-1 font-semibold uppercase">
                        Scan Code
                      </span>
                    </div>

                    {/* Details */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-bold text-[#0f62fe] uppercase tracking-widest font-mono">
                          {item.category}
                        </span>
                        <StatusBadge status={item.status} isOverdue={item.isOverdue} size="sm" />
                      </div>

                      <strong className="text-base font-mono font-bold text-[#161616] block truncate">
                        {item.equipmentCode}
                      </strong>
                      <p className="text-xs text-[#161616] font-semibold truncate">{item.name}</p>
                      <p className="text-[11px] text-[#525252] truncate font-mono">{locationStr || 'Location unassigned'}</p>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="no-print bg-[#f4f4f4] px-5 py-3 border-t border-[#e0e0e0] flex items-center justify-between text-xs">
                    <span className="text-[#525252] font-mono text-[11px]">
                      {item.manufacturer} {item.model}
                    </span>
                    {item.profileUrl && (
                      <a
                        href={resolveProfileUrl(item.profileUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#0f62fe] hover:underline font-bold"
                      >
                        Open Profile <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="no-print">
            <Pagination
              meta={pagination}
              currentPage={currentPage}
              onPageChange={(p) => setCurrentPage(p)}
            />
          </div>
        </>
      )}
    </div>
  );
};
