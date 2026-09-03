import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { CarbonSelect, type CarbonSelectOption } from '../common/CarbonSelect';
import type { Equipment } from '../../types';
import { ApiError } from '../../api/client';
import { ArrowRightLeft, AlertCircle } from 'lucide-react';

interface ReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReplace: (equipmentId: string, payload: { replacementEquipmentId: string; reason?: string }) => Promise<void>;
  equipment: Equipment | null;
  allEquipment: Equipment[];
}

export const ReplaceModal: React.FC<ReplaceModalProps> = ({
  isOpen,
  onClose,
  onReplace,
  equipment,
  allEquipment = [],
}) => {
  const [replacementEquipmentId, setReplacementEquipmentId] = useState('');
  const [reason, setReason] = useState('Upgraded to successor equipment');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const candidates = allEquipment.filter(
    (item) => item.id !== equipment?.id && item.status !== 'Retired'
  );

  useEffect(() => {
    if (candidates.length > 0 && (!replacementEquipmentId || !candidates.some((c) => c.id === replacementEquipmentId))) {
      setReplacementEquipmentId(candidates[0].id);
    }
    setError('');
    setFieldErrors({});
  }, [equipment, isOpen, allEquipment]);

  const candidateOptions: CarbonSelectOption[] = [
    { value: '', label: 'Select successor equipment asset' },
    ...candidates.map((item) => ({
      value: item.id,
      label: `${item.equipmentCode} · ${item.name} (${item.category})`,
    })),
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipment) return;

    setError('');
    setFieldErrors({});

    if (!replacementEquipmentId) {
      setFieldErrors({ replacementEquipmentId: 'Please select a valid successor replacement asset.' });
      return;
    }

    setLoading(true);

    try {
      await onReplace(equipment.id, {
        replacementEquipmentId,
        reason: reason.trim() || undefined,
      });
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors);
        setError('');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to process equipment replacement.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Replace Equipment: ${equipment?.equipmentCode || ''}`}
      subtitle="Link existing asset to its successor replacement asset."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 font-['IBM_Plex_Sans',sans-serif]">
        {error && (
          <div className="p-3 bg-[#fff0f1] border-l-4 border-[#da1e28] text-[#da1e28] text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-4 bg-[#f6f2ff] border border-[#d4bbff] rounded-none flex items-start gap-3 text-[#6929c4]">
          <ArrowRightLeft className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold uppercase tracking-wider">Lifecycle Replacement Linking</p>
            <p className="text-[#161616]">
              Scanning <strong className="font-mono">{equipment?.equipmentCode}</strong> in the future will inform the technician that the machine was replaced and link directly to the successor asset.
            </p>
          </div>
        </div>

        <CarbonSelect
          label="Successor Replacement Asset"
          required
          options={candidateOptions}
          value={replacementEquipmentId}
          onChange={(val) => setReplacementEquipmentId(val)}
          placeholder="Select replacement equipment"
          error={fieldErrors.replacementEquipmentId}
        />

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#525252]">
              Reason / Notes
            </label>
            {fieldErrors.reason && (
              <span className="text-[11px] text-[#da1e28] font-bold">{fieldErrors.reason}</span>
            )}
          </div>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Upgraded to higher capacity model"
            className={`carbon-input w-full text-xs ${fieldErrors.reason ? 'carbon-input-error' : ''}`}
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#e0e0e0] pt-4 mt-6">
          <button type="button" onClick={onClose} className="carbon-btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="carbon-btn-primary bg-[#6929c4] hover:bg-[#491d8b] disabled:opacity-50">
            {loading ? 'Processing Link...' : 'Confirm Asset Replacement'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
