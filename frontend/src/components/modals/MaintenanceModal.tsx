import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { CarbonSelect, type CarbonSelectOption } from '../common/CarbonSelect';
import type { Equipment, Technician } from '../../types';
import { AlertCircle } from 'lucide-react';

interface MaintenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (equipmentId: string, payload: unknown) => Promise<void>;
  equipment: Equipment | null;
  technicians?: Technician[];
}

export const MaintenanceModal: React.FC<MaintenanceModalProps> = ({
  isOpen,
  onClose,
  onSave,
  equipment,
  technicians = [],
}) => {
  const [type, setType] = useState('Preventive');
  const [performedByTechnicianId, setPerformedByTechnicianId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [partsUsedInput, setPartsUsedInput] = useState('');
  const [nextRecommendedDate, setNextRecommendedDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (equipment) {
      setPerformedByTechnicianId(equipment.assignedTechnicianId || (technicians[0]?.id || ''));
      setType('Preventive');
      setDate(new Date().toISOString().slice(0, 10));
      setDescription('');
      setPartsUsedInput('');
      setNextRecommendedDate('');
    }
    setError('');
    setFieldErrors({});
  }, [equipment, isOpen, technicians]);

  const workTypeOptions: CarbonSelectOption[] = [
    { value: 'Preventive', label: 'Preventive Service' },
    { value: 'Scheduled', label: 'Scheduled Maintenance' },
    { value: 'Corrective', label: 'Corrective Repair / Repair Work' },
    { value: 'Inspection', label: 'Inspection & Testing' },
  ];

  const technicianOptions: CarbonSelectOption[] = [
    { value: '', label: 'Select Performing Technician' },
    ...technicians.map((tech) => ({
      value: tech.id,
      label: `${tech.name} (${tech.specialty || 'Service Tech'})`,
    })),
  ];

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!description.trim()) errs.description = 'Work description summary is required';
    if (!type) errs.type = 'Service type selection is required';
    if (!performedByTechnicianId) errs.technician = 'Performing technician is required';
    if (!date) errs.date = 'Service date is required';

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipment) return;

    setError('');

    if (!validate()) {
      setError('Please complete all required fields highlighted below.');
      return;
    }

    setLoading(true);

    try {
      const partsUsed = partsUsedInput
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

      const serviceDateIso = new Date(date).toISOString();
      const nextDateIso = nextRecommendedDate ? new Date(nextRecommendedDate).toISOString() : undefined;

      const payload = {
        type,
        performedByTechnicianId,
        date: serviceDateIso,
        description: description.trim(),
        partsUsed: partsUsed.length ? partsUsed : undefined,
        nextRecommendedDate: nextDateIso,
      };

      await onSave(equipment.id, payload);
      onClose();
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('Failed to log maintenance event.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Log Service Event: ${equipment?.equipmentCode || ''}`}
      subtitle={`Equipment: ${equipment?.name || ''}`}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 font-['IBM_Plex_Sans',sans-serif]">
        {error && (
          <div className="p-3 bg-[#fff0f1] border-l-4 border-[#da1e28] text-[#da1e28] text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <CarbonSelect
          label="Service / Work Type"
          required
          options={workTypeOptions}
          value={type}
          onChange={(val) => setType(val)}
          error={fieldErrors.type}
        />

        <CarbonSelect
          label="Performing Technician"
          required
          options={technicianOptions}
          value={performedByTechnicianId}
          onChange={(val) => setPerformedByTechnicianId(val)}
          placeholder="Select Technician"
          error={fieldErrors.technician}
        />

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#525252] mb-1">
            Service Date <span className="text-[#da1e28]">*</span>
          </label>
          <input
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`carbon-input w-full text-xs font-mono ${fieldErrors.date ? 'carbon-input-error' : ''}`}
          />
          {fieldErrors.date && (
            <span className="text-[11px] text-[#da1e28] font-semibold mt-1 block">{fieldErrors.date}</span>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#525252] mb-1">
            Work Summary & Description <span className="text-[#da1e28]">*</span>
          </label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detail work performed, measurements, parts installed, condition notes..."
            className={`carbon-input w-full text-xs ${fieldErrors.description ? 'carbon-input-error' : ''}`}
          />
          {fieldErrors.description && (
            <span className="text-[11px] text-[#da1e28] font-semibold mt-1 block">{fieldErrors.description}</span>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#525252] mb-1">
            Parts Replaced (comma separated)
          </label>
          <input
            type="text"
            value={partsUsedInput}
            onChange={(e) => setPartsUsedInput(e.target.value)}
            placeholder="e.g. Mechanical Seal, O-Ring Kit 42, Synthetic Oil 5L"
            className="carbon-input w-full text-xs font-mono"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#525252] mb-1">
            Next Advised Service Date (Optional)
          </label>
          <input
            type="date"
            value={nextRecommendedDate}
            onChange={(e) => setNextRecommendedDate(e.target.value)}
            className="carbon-input w-full text-xs font-mono"
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#e0e0e0] pt-4 mt-6">
          <button type="button" onClick={onClose} className="carbon-btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="carbon-btn-primary disabled:opacity-50">
            {loading ? 'Recording Log...' : 'Record Maintenance Log'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
