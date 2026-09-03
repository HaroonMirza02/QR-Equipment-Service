import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import type { Equipment } from '../../types';
import { AlertOctagon } from 'lucide-react';

interface RetireModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetire: (equipmentId: string, reason: string) => Promise<void>;
  equipment: Equipment | null;
}

export const RetireModal: React.FC<RetireModalProps> = ({
  isOpen,
  onClose,
  onRetire,
  equipment,
}) => {
  const [reason, setReason] = useState('Retired from service');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipment) return;

    setError('');
    if (!reason.trim()) {
      setError('Retirement reason is required.');
      return;
    }

    setLoading(true);

    try {
      await onRetire(equipment.id, reason.trim());
      onClose();
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('Failed to retire equipment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Retire Equipment: ${equipment?.equipmentCode || ''}`}
      subtitle="Decommission asset from active plant service."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 font-['IBM_Plex_Sans',sans-serif]">
        {error && (
          <div className="p-3 bg-[#fff0f1] border-l-4 border-[#da1e28] text-[#da1e28] text-xs font-semibold">
            {error}
          </div>
        )}

        <div className="p-4 bg-[#fff0f1] border border-[#ff7eb6] rounded-none flex items-start gap-3 text-[#da1e28]">
          <AlertOctagon className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold uppercase tracking-wider">Warning: Permanent Retirement</p>
            <p className="text-[#161616]">
              Retiring <strong className="font-mono">{equipment?.equipmentCode}</strong> will mark its printed QR label as a retired tombstone. New service records or faults can no longer be added.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#525252] mb-1">
            Retirement Reason / Notes <span className="text-[#da1e28]">*</span>
          </label>
          <input
            type="text"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. End of operational lifespan, unrepairable damage"
            className="carbon-input w-full text-xs"
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#e0e0e0] pt-4 mt-6">
          <button type="button" onClick={onClose} className="carbon-btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="carbon-btn-danger disabled:opacity-50">
            {loading ? 'Retiring...' : 'Confirm Equipment Retirement'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
