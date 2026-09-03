import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { CarbonSelect, type CarbonSelectOption } from '../common/CarbonSelect';
import type { Equipment, FaultIncident } from '../../types';
import { ApiError } from '../../api/client';
import { AlertCircle } from 'lucide-react';

interface FaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReportFault?: (equipmentId: string, payload: unknown) => Promise<void>;
  onResolveFault?: (faultId: string, resolutionNotes: string) => Promise<void>;
  equipment?: Equipment | null;
  resolvingFault?: FaultIncident | null;
}

export const FaultModal: React.FC<FaultModalProps> = ({
  isOpen,
  onClose,
  onReportFault,
  onResolveFault,
  equipment,
  resolvingFault,
}) => {
  const isResolving = Boolean(resolvingFault);

  // Report Fault fields
  const [severity, setSeverity] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Resolve Fault fields
  const [resolutionNotes, setResolutionNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setSeverity('Medium');
    setTitle('');
    setDescription('');
    setResolutionNotes('');
    setError('');
    setFieldErrors({});
  }, [equipment, resolvingFault, isOpen]);

  const severityOptions: CarbonSelectOption[] = [
    { value: 'Low', label: 'Low Severity (Minor issue / monitoring)' },
    { value: 'Medium', label: 'Medium Severity (Degraded performance)' },
    { value: 'High', label: 'High Severity (Operation impacted)' },
    { value: 'Critical', label: 'Critical Severity (Safety risk / System down)' },
  ];

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (isResolving) {
      if (!resolutionNotes.trim()) errs.resolutionNotes = 'Resolution details are required to resolve a fault incident';
    } else {
      if (!description.trim()) errs.description = 'Detailed fault description is required';
      if (!severity) errs.severity = 'Severity level selection is required';
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    if (!validate()) {
      return;
    }

    setLoading(true);

    try {
      if (isResolving && resolvingFault && onResolveFault) {
        await onResolveFault(resolvingFault.id, resolutionNotes.trim());
      } else if (!isResolving && equipment && onReportFault) {
        await onReportFault(equipment.id, {
          reportedDate: new Date().toISOString(),
          severity,
          title: title.trim() || undefined,
          description: description.trim(),
        });
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors);
        setError('');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to process fault request.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isResolving
          ? `Resolve Fault Incident`
          : `Report Equipment Fault: ${equipment?.equipmentCode || ''}`
      }
      subtitle={
        isResolving
          ? `Incident ID: ${resolvingFault?.id}`
          : `Equipment status will automatically update to Faulty upon reporting.`
      }
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 font-['IBM_Plex_Sans',sans-serif]">
        {error && (
          <div className="p-3 bg-[#fff0f1] border-l-4 border-[#da1e28] text-[#da1e28] text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isResolving ? (
          <div>
            <div className="p-3 bg-[#f4f4f4] border border-[#e0e0e0] rounded-none mb-4 text-xs space-y-1 font-mono">
              <div>
                <span className="font-bold text-[#525252]">Severity:</span>{' '}
                <span className="font-bold text-[#da1e28]">{resolvingFault?.severity}</span>
              </div>
              <div>
                <span className="font-bold text-[#525252]">Reported Description:</span>{' '}
                <span className="text-[#161616] font-sans">{resolvingFault?.description}</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#525252]">
                  Resolution & Repairs Carried Out <span className="text-[#da1e28]">*</span>
                </label>
                {fieldErrors.resolutionNotes && (
                  <span className="text-[11px] text-[#da1e28] font-bold">
                    {fieldErrors.resolutionNotes}
                  </span>
                )}
              </div>
              <textarea
                rows={4}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Describe how fault was diagnosed, repaired, tested, and restored..."
                className={`carbon-input w-full text-xs ${fieldErrors.resolutionNotes ? 'carbon-input-error' : ''}`}
              />
            </div>
          </div>
        ) : (
          <>
            <CarbonSelect
              label="Severity Level"
              required
              options={severityOptions}
              value={severity}
              onChange={(val) => setSeverity(val as 'Low' | 'Medium' | 'High' | 'Critical')}
              error={fieldErrors.severity}
            />

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#525252]">
                  Fault Title / Subject
                </label>
                {fieldErrors.title && (
                  <span className="text-[11px] text-[#da1e28] font-bold">
                    {fieldErrors.title}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Bearing noise and elevated temperature"
                className={`carbon-input w-full text-xs ${fieldErrors.title ? 'carbon-input-error' : ''}`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#525252]">
                  Detailed Fault Description <span className="text-[#da1e28]">*</span>
                </label>
                {fieldErrors.description && (
                  <span className="text-[11px] text-[#da1e28] font-bold">
                    {fieldErrors.description}
                  </span>
                )}
              </div>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detail symptoms, error codes, leaking fluids, or physical damage..."
                className={`carbon-input w-full text-xs ${fieldErrors.description ? 'carbon-input-error' : ''}`}
              />
            </div>
          </>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-[#e0e0e0] pt-4 mt-6">
          <button type="button" onClick={onClose} className="carbon-btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="carbon-btn-danger disabled:opacity-50"
          >
            {loading ? 'Submitting Report...' : isResolving ? 'Resolve Fault' : 'Report Fault & Mark Equipment Faulty'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
