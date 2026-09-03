import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { PassportData } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';
import { MaintenanceTimeline } from '../components/timeline/MaintenanceTimeline';
import { FaultTimeline } from '../components/timeline/FaultTimeline';
import {
  ShieldCheck,
  AlertTriangle,
  Wrench,
  Calendar,
  MapPin,
  Share2,
  RefreshCw,
  Cpu,
  AlertOctagon,
  ArrowRight,
} from 'lucide-react';

export const EquipmentProfilePage: React.FC = () => {
  const { qrToken } = useParams<{ qrToken: string }>();

  const [profile, setProfile] = useState<PassportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<{
    status?: string;
    title?: string;
    message?: string;
    successor?: { equipmentCode: string; name: string; profileUrl: string };
  } | null>(null);

  const [activeTab, setActiveTab] = useState<'maintenance' | 'faults'>('maintenance');
  const [shareSuccess, setShareSuccess] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!qrToken) return;
    setLoading(true);
    setErrorState(null);

    try {
      const res = await apiClient<PassportData>(`/api/public/scan/${qrToken}`);
      const data = res.data;
      const statusKey = String(data.status || '').toLowerCase();

      if (['retired', 'replaced', 'revoked', 'restricted'].includes(statusKey)) {
        let title = 'Equipment Notice';
        let msg = data.message || 'Equipment record updated.';
        if (statusKey === 'retired') {
          title = 'Asset Retired from Service';
          msg = 'This equipment is decommissioned and no longer in active operation.';
        } else if (statusKey === 'replaced') {
          title = 'Asset Replaced';
          msg = 'This machine has been replaced by a new equipment item.';
        } else if (statusKey === 'revoked') {
          title = 'QR Label Revoked';
          msg = 'This physical QR label is no longer current and has been superseded.';
        }

        setErrorState({
          status: statusKey,
          title,
          message: msg,
          successor: data.successor,
        });
      } else {
        setProfile(data);
      }
    } catch (err) {
      setErrorState({
        status: 'invalid',
        title: 'Unrecognized or Inactive QR Label',
        message:
          err instanceof Error
            ? err.message
            : 'The QR code label is invalid or could not be found in the system database.',
      });
    } finally {
      setLoading(false);
    }
  }, [qrToken]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleShare = async () => {
    if (!profile) return;
    const shareData = {
      title: `${profile.equipmentCode} · ${profile.name}`,
      text: `PlantOps Equipment Passport: ${profile.status}`,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 2500);
      }
    } catch {
      // User cancelled share
    }
  };

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

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-[#161616] text-white flex items-center justify-center p-4 font-['IBM_Plex_Sans',sans-serif]">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-2 border-[#0f62fe] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs uppercase font-mono tracking-widest text-[#78a9ff] font-bold">
            Resolving QR Token
          </p>
          <h1 className="text-lg font-bold text-white">Opening Equipment Passport...</h1>
          <p className="text-xs text-[#a8a8a8]">Verifying live service and maintenance records.</p>
        </div>
      </div>
    );
  }

  // System Warning / Retired / Replaced / Error State
  if (errorState) {
    return (
      <div className="min-h-screen bg-[#161616] text-white flex items-center justify-center p-4 font-['IBM_Plex_Sans',sans-serif]">
        <div className="max-w-md w-full bg-[#262626] border border-[#393939] p-6 sm:p-8 text-center space-y-6 rounded-none">
          <div className="w-12 h-12 rounded-none bg-[#fcf4d6] border border-[#f1c21b] text-[#b28600] flex items-center justify-center mx-auto text-xl font-bold">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#f1c21b]">
              {errorState.status?.toUpperCase() || 'SCAN NOTICE'}
            </span>
            <h1 className="text-xl font-bold text-white mt-1">{errorState.title}</h1>
            <p className="text-xs text-[#c6c6c6] mt-2 leading-relaxed">{errorState.message}</p>
          </div>

          {errorState.successor && (
            <div className="p-4 bg-[#edf5ff]/10 border border-[#0f62fe] text-left space-y-1 rounded-none">
              <span className="text-[10px] uppercase font-mono font-bold text-[#78a9ff]">
                Successor Replacement Asset
              </span>
              <div className="font-bold font-mono text-sm text-white">
                {errorState.successor.equipmentCode} · {errorState.successor.name}
              </div>
              {errorState.successor.profileUrl && (
                <a
                  href={errorState.successor.profileUrl}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#78a9ff] hover:underline pt-1"
                >
                  Open Replacement Passport <ArrowRight className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}

          <div className="pt-2">
            <Link
              to="/demo"
              className="inline-flex items-center gap-2 carbon-btn-secondary text-xs font-semibold"
            >
              Open QR Label Lab
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const locationStr = [profile.location?.site, profile.location?.building, profile.location?.zone]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="min-h-screen bg-[#f4f4f4] text-[#161616] pb-12 font-['IBM_Plex_Sans',sans-serif]">
      {/* Verified Record Header */}
      <header className="bg-[#161616] text-white border-b border-[#393939] px-4 py-3 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#0f62fe]" />
            <span className="font-bold text-sm text-white tracking-tight">PlantOps</span>
            <span className="text-[10px] text-[#a8a8a8] font-mono uppercase">Passport</span>
          </div>
          <div className="flex items-center gap-1.5 bg-[#defbe6] border border-[#24a148] px-2.5 py-1 rounded-none text-[11px] font-semibold text-[#198038]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#24a148]" />
            <span>Verified Record</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
        {/* Main Identity Banner */}
        <section className="bg-white rounded-none p-5 sm:p-6 border border-[#e0e0e0] space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-mono font-bold text-[#0f62fe] uppercase tracking-widest block">
                {profile.category} · {profile.equipmentCode}
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#161616] tracking-tight leading-tight mt-0.5">
                {profile.name}
              </h1>
              <div className="flex items-center gap-1.5 text-xs text-[#525252] mt-2 font-mono">
                <MapPin className="w-4 h-4 text-[#8d8d8d] shrink-0" />
                <span>{locationStr || 'Location not recorded'}</span>
              </div>
            </div>

            <button
              onClick={handleShare}
              className="p-2 bg-[#f4f4f4] hover:bg-[#e5e5e5] text-[#161616] rounded-none border border-[#8d8d8d] transition-colors shrink-0"
              title="Share Equipment Passport"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>

          {shareSuccess && (
            <div className="text-xs font-semibold text-[#198038] bg-[#defbe6] p-2 rounded-none border border-[#24a148] text-center font-mono">
              Passport URL copied to clipboard!
            </div>
          )}

          {/* Condition Alert Banner */}
          <div className="pt-3 border-t border-[#e0e0e0] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusBadge status={profile.status} isOverdue={profile.isOverdue} size="lg" />
            </div>

            <button
              onClick={fetchProfile}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#161616] hover:bg-[#e5e5e5] bg-[#f4f4f4] px-3 py-1.5 border border-[#8d8d8d]"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#525252]" />
              Refresh
            </button>
          </div>
        </section>

        {/* Warning Banner Alerts */}
        {profile.status === 'Faulty' && (
          <div className="p-4 bg-[#fff0f1] border-l-4 border-[#da1e28] rounded-none flex items-start gap-3 text-[#da1e28]">
            <AlertOctagon className="w-6 h-6 text-[#da1e28] shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <h4 className="font-bold text-sm uppercase tracking-wider">Critical Attention Required</h4>
              <p className="text-[#161616]">
                Equipment is marked Faulty with unresolved incidents. Isolate machine before servicing.
              </p>
            </div>
          </div>
        )}

        {profile.status === 'Under Maintenance' && (
          <div className="p-4 bg-[#edf5ff] border-l-4 border-[#0f62fe] rounded-none flex items-start gap-3 text-[#0043ce]">
            <Wrench className="w-6 h-6 text-[#0f62fe] shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <h4 className="font-bold text-sm uppercase tracking-wider">Maintenance Work In Progress</h4>
              <p className="text-[#161616]">This equipment is currently undergoing maintenance or inspection by technicians.</p>
            </div>
          </div>
        )}

        {profile.isOverdue && profile.status === 'Operational' && (
          <div className="p-4 bg-[#fcf4d6] border-l-4 border-[#f1c21b] rounded-none flex items-start gap-3 text-[#b28600]">
            <Calendar className="w-6 h-6 text-[#b28600] shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <h4 className="font-bold text-sm uppercase tracking-wider">Maintenance Schedule Overdue</h4>
              <p className="text-[#161616]">
                Service was due <strong className="font-mono">{profile.daysOverdue} days ago</strong>. Schedule routine maintenance promptly.
              </p>
            </div>
          </div>
        )}

        {/* Maintenance Summary Grid */}
        <section className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-['IBM_Plex_Sans',sans-serif]">
          <div className="bg-white p-4 rounded-none border border-[#e0e0e0] text-center sm:text-left">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#525252] block">
              Last Service
            </span>
            <strong className="text-sm sm:text-base font-bold text-[#161616] block mt-0.5 font-mono">
              {formatDate(profile.maintenanceSummary?.lastMaintenanceDate)}
            </strong>
            <span className="text-[11px] text-[#525252] block truncate">
              {profile.maintenanceSummary?.lastMaintenanceType || 'No record'}
            </span>
          </div>

          <div
            className={`p-4 rounded-none border text-center sm:text-left ${
              profile.isOverdue ? 'bg-[#fcf4d6] border-[#f1c21b]' : 'bg-white border-[#e0e0e0]'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#525252] block">
              Next Due
            </span>
            <strong
              className={`text-sm sm:text-base font-bold block mt-0.5 font-mono ${
                profile.isOverdue ? 'text-[#b28600]' : 'text-[#161616]'
              }`}
            >
              {formatDate(profile.nextMaintenanceDate)}
            </strong>
            <span className="text-[11px] text-[#525252] block">
              {profile.nextMaintenanceDate ? 'Scheduled' : 'Not set'}
            </span>
          </div>

          <div className="bg-white p-4 rounded-none border border-[#e0e0e0] text-center sm:text-left col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#525252] block">
              Open Faults
            </span>
            <strong
              className={`text-sm sm:text-base font-bold block mt-0.5 font-mono ${
                (profile.faultSummary?.openCount || 0) > 0 ? 'text-[#da1e28]' : 'text-[#161616]'
              }`}
            >
              {profile.faultSummary?.openCount || 0} Open
            </strong>
            <span className="text-[11px] text-[#525252] block truncate font-mono">
              {profile.faultSummary?.highestOpenSeverity
                ? `${profile.faultSummary.highestOpenSeverity} severity`
                : 'Clear'}
            </span>
          </div>
        </section>

        {/* History Timelines Tabbed Panel */}
        <section className="bg-white rounded-none border border-[#e0e0e0] p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-3">
            <h2 className="text-base font-bold text-[#161616] uppercase tracking-wider">Equipment History</h2>
            <div className="flex bg-[#f4f4f4] p-1 rounded-none gap-1 text-xs font-semibold border border-[#e0e0e0]">
              <button
                onClick={() => setActiveTab('maintenance')}
                className={`px-3 py-1.5 rounded-none transition-colors ${
                  activeTab === 'maintenance'
                    ? 'bg-[#161616] text-white font-bold'
                    : 'text-[#525252] hover:text-[#161616]'
                }`}
              >
                Service Logs ({profile.maintenanceHistory?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('faults')}
                className={`px-3 py-1.5 rounded-none transition-colors ${
                  activeTab === 'faults'
                    ? 'bg-[#161616] text-white font-bold'
                    : 'text-[#525252] hover:text-[#161616]'
                }`}
              >
                Faults ({profile.faultHistory?.length || 0})
              </button>
            </div>
          </div>

          {activeTab === 'maintenance' ? (
            <MaintenanceTimeline events={profile.maintenanceHistory} />
          ) : (
            <FaultTimeline faults={profile.faultHistory} />
          )}
        </section>

        {/* Assigned Technician & Technical Specifications */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-['IBM_Plex_Sans',sans-serif]">
          {/* Assigned Technician */}
          <section className="bg-white p-5 rounded-none border border-[#e0e0e0] space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#525252]">
              Assigned Field Technician
            </h3>
            {profile.assignedTechnician ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none bg-[#161616] text-[#78a9ff] font-bold font-mono flex items-center justify-center text-sm shrink-0 border border-[#393939]">
                  {profile.assignedTechnician.name
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')}
                </div>
                <div>
                  <strong className="text-[#161616] font-bold block">
                    {profile.assignedTechnician.name}
                  </strong>
                  <span className="text-xs text-[#525252] font-medium">
                    {profile.assignedTechnician.specialty || 'Service Technician'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-[#8d8d8d] italic py-2">No technician assigned.</div>
            )}
          </section>

          {/* Machine Details */}
          <section className="bg-white p-5 rounded-none border border-[#e0e0e0] space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#525252]">
              Asset Identification Specs
            </h3>
            <dl className="text-xs space-y-2 font-mono">
              <div className="flex justify-between border-b border-[#f4f4f4] pb-1">
                <dt className="text-[#525252]">Manufacturer:</dt>
                <dd className="font-semibold text-[#161616]">{profile.manufacturer}</dd>
              </div>
              <div className="flex justify-between border-b border-[#f4f4f4] pb-1">
                <dt className="text-[#525252]">Model:</dt>
                <dd className="font-semibold text-[#161616]">{profile.model}</dd>
              </div>
              <div className="flex justify-between border-b border-[#f4f4f4] pb-1">
                <dt className="text-[#525252]">Serial Number:</dt>
                <dd className="font-semibold text-[#161616]">{profile.serialNumber || 'Not recorded'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#525252]">Installed Date:</dt>
                <dd className="font-semibold text-[#161616]">{formatDate(profile.installationDate)}</dd>
              </div>
            </dl>
          </section>
        </div>
      </main>
    </div>
  );
};
