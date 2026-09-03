import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { CarbonSelect, type CarbonSelectOption } from '../common/CarbonSelect';
import type { Equipment, EquipmentCategory, Technician } from '../../types';
import { ApiError } from '../../api/client';
import { QrCode, AlertCircle } from 'lucide-react';

interface EquipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: Partial<Equipment>) => Promise<void>;
  equipment?: Equipment | null;
  technicians?: Technician[];
}

export const EquipmentModal: React.FC<EquipmentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  equipment,
  technicians = [],
}) => {
  const isEditing = Boolean(equipment?.id);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<EquipmentCategory | ''>('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [site, setSite] = useState('');
  const [building, setBuilding] = useState('');
  const [zone, setZone] = useState('');
  const [installationDate, setInstallationDate] = useState('');
  const [maintenanceIntervalDays, setMaintenanceIntervalDays] = useState(90);
  const [assignedTechnicianId, setAssignedTechnicianId] = useState('');
  const [isPublicVisible, setIsPublicVisible] = useState(true);
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (equipment) {
      setCode(equipment.equipmentCode || '');
      setName(equipment.name || '');
      setCategory(equipment.category || '');
      setManufacturer(equipment.manufacturer || '');
      setModel(equipment.model || '');
      setSerialNumber(equipment.serialNumber || '');
      setSite(equipment.location?.site || '');
      setBuilding(equipment.location?.building || '');
      setZone(equipment.location?.zone || '');
      setInstallationDate(equipment.installationDate?.slice(0, 10) || new Date().toISOString().slice(0, 10));
      setMaintenanceIntervalDays(equipment.maintenanceIntervalDays || 90);
      setAssignedTechnicianId(equipment.assignedTechnicianId || '');
      setIsPublicVisible(equipment.isPublicVisible !== false);
      setNotes(equipment.notes || '');
    } else {
      setCode('');
      setName('');
      setCategory('');
      setManufacturer('');
      setModel('');
      setSerialNumber('');
      setSite('');
      setBuilding('');
      setZone('');
      setInstallationDate(new Date().toISOString().slice(0, 10));
      setMaintenanceIntervalDays(90);
      setAssignedTechnicianId('');
      setIsPublicVisible(true);
      setNotes('');
    }
    setError('');
    setFieldErrors({});
  }, [equipment, isOpen]);

  const categoryOptions: CarbonSelectOption[] = [
    { value: 'Pump', label: 'Pump' },
    { value: 'Generator', label: 'Generator' },
    { value: 'Compressor', label: 'Compressor' },
    { value: 'HVAC', label: 'HVAC' },
    { value: 'Electrical', label: 'Electrical' },
    { value: 'Other', label: 'Other' },
  ];

  const technicianOptions: CarbonSelectOption[] = [
    { value: '', label: 'Unassigned' },
    ...technicians.map((t) => ({
      value: t.id,
      label: `${t.name} (${t.specialty || 'General'})`,
    })),
  ];

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!code.trim()) errs.code = 'Equipment code is required';
    if (!name.trim()) errs.name = 'Equipment name is required';
    if (!category) errs.category = 'Category selection is required';
    if (!manufacturer.trim()) errs.manufacturer = 'Manufacturer is required';
    if (!model.trim()) errs.model = 'Model is required';
    if (!maintenanceIntervalDays || maintenanceIntervalDays < 1) {
      errs.interval = 'Service interval must be at least 1 day';
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validate()) {
      setError('Please fill in all required fields highlighted below.');
      return;
    }

    setLoading(true);

    try {
      const payload: Partial<Equipment> = {
        equipmentCode: code.trim(),
        name: name.trim(),
        category: category as EquipmentCategory,
        manufacturer: manufacturer.trim(),
        model: model.trim(),
        serialNumber: serialNumber.trim() || undefined,
        location: {
          site: site.trim(),
          building: building.trim(),
          zone: zone.trim(),
        },
        maintenanceIntervalDays: Number(maintenanceIntervalDays),
        assignedTechnicianId: assignedTechnicianId || undefined,
        isPublicVisible,
        notes: notes.trim() || undefined,
      };

      if (!isEditing) {
        payload.installationDate = installationDate;
      }

      await onSave(payload);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors);
        setError('');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to save equipment.');
      }
    } finally {
      setLoading(false);
    }
  };

  const locationPreview = [site.trim(), building.trim(), zone.trim()].filter(Boolean).join(' · ') || 'Site · Building · Zone';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit Equipment: ${equipment?.equipmentCode}` : 'Add New Equipment'}
      subtitle={
        isEditing
          ? 'Update the live asset record. Its stable QR will remain unchanged.'
          : 'Create record first; its stable QR label will be issued immediately.'
      }
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5 font-['IBM_Plex_Sans',sans-serif]">
        {error && (
          <div className="p-3 bg-[#fff0f1] border-l-4 border-[#da1e28] text-[#da1e28] text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Section 01: Equipment Identity */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#161616] border-b border-[#e0e0e0] pb-1 mb-3">
            01. Equipment Identity
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#525252] mb-1">
                Equipment Code <span className="text-[#da1e28]">*</span>
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. PUMP-021"
                className={`carbon-input w-full font-mono ${fieldErrors.code ? 'carbon-input-error' : ''}`}
              />
              {fieldErrors.code && (
                <span className="text-[11px] text-[#da1e28] font-semibold mt-1 block">{fieldErrors.code}</span>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#525252] mb-1">
                Equipment Name <span className="text-[#da1e28]">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Cooling Water Pump"
                className={`carbon-input w-full ${fieldErrors.name ? 'carbon-input-error' : ''}`}
              />
              {fieldErrors.name && (
                <span className="text-[11px] text-[#da1e28] font-semibold mt-1 block">{fieldErrors.name}</span>
              )}
            </div>

            <CarbonSelect
              label="Category"
              required
              options={categoryOptions}
              value={category}
              onChange={(val) => setCategory(val as EquipmentCategory)}
              placeholder="Select category"
              error={fieldErrors.category}
            />

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#525252] mb-1">
                Serial Number
              </label>
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="Optional"
                className="carbon-input w-full font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#525252] mb-1">
                Manufacturer <span className="text-[#da1e28]">*</span>
              </label>
              <input
                type="text"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="e.g. Grundfos"
                className={`carbon-input w-full ${fieldErrors.manufacturer ? 'carbon-input-error' : ''}`}
              />
              {fieldErrors.manufacturer && (
                <span className="text-[11px] text-[#da1e28] font-semibold mt-1 block">{fieldErrors.manufacturer}</span>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#525252] mb-1">
                Model <span className="text-[#da1e28]">*</span>
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. CM5-6"
                className={`carbon-input w-full ${fieldErrors.model ? 'carbon-input-error' : ''}`}
              />
              {fieldErrors.model && (
                <span className="text-[11px] text-[#da1e28] font-semibold mt-1 block">{fieldErrors.model}</span>
              )}
            </div>
          </div>
        </div>

        {/* Section 02: Installation and Location */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#161616] border-b border-[#e0e0e0] pb-1 mb-3">
            02. Location & Maintenance Schedule
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-semibold mb-1">Site</label>
              <input
                type="text"
                value={site}
                onChange={(e) => setSite(e.target.value)}
                placeholder="Main Plant"
                className="carbon-input w-full text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-semibold mb-1">Building</label>
              <input
                type="text"
                value={building}
                onChange={(e) => setBuilding(e.target.value)}
                placeholder="Building A"
                className="carbon-input w-full text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-semibold mb-1">Zone / Room</label>
              <input
                type="text"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                placeholder="Pump Room 2"
                className="carbon-input w-full text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-semibold mb-1">Installation Date</label>
              <input
                type="date"
                disabled={isEditing}
                value={installationDate}
                onChange={(e) => setInstallationDate(e.target.value)}
                className="carbon-input w-full text-xs font-mono disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#525252] uppercase font-semibold mb-1">
                Interval (Days) <span className="text-[#da1e28]">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={maintenanceIntervalDays}
                onChange={(e) => setMaintenanceIntervalDays(Number(e.target.value))}
                className={`carbon-input w-full text-xs font-mono ${fieldErrors.interval ? 'carbon-input-error' : ''}`}
              />
            </div>

            <CarbonSelect
              label="Assigned Technician"
              options={technicianOptions}
              value={assignedTechnicianId}
              onChange={(val) => setAssignedTechnicianId(val)}
              placeholder="Unassigned"
              size="sm"
            />
          </div>
        </div>

        {/* Live Physical Label Preview */}
        <div className="border-t border-[#e0e0e0] pt-4">
          <label className="flex items-center gap-2 mb-3 cursor-pointer text-xs font-medium text-[#161616]">
            <input
              type="checkbox"
              checked={isPublicVisible}
              onChange={(e) => setIsPublicVisible(e.target.checked)}
              className="rounded-none text-[#0f62fe] focus:ring-0 w-4 h-4"
            />
            Publicly Visible Passport (scannable without login)
          </label>

          <div className="bg-[#161616] text-white p-4 rounded-none border border-[#393939] flex items-center gap-4">
            <div className="w-14 h-14 bg-white p-1 rounded-none shrink-0 flex items-center justify-center">
              <QrCode className="w-10 h-10 text-[#161616]" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-mono font-bold text-[#78a9ff] uppercase tracking-widest block">
                Live Label Preview
              </span>
              <strong className="text-sm font-mono font-bold text-white block truncate">
                {code.trim().toUpperCase() || 'EQUIPMENT CODE'}
              </strong>
              <p className="text-xs text-[#c6c6c6] truncate">{name.trim() || 'Equipment name'}</p>
              <p className="text-[11px] text-[#a8a8a8] truncate mt-0.5">{locationPreview}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 border-t border-[#e0e0e0] pt-4">
          <button type="button" onClick={onClose} className="carbon-btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="carbon-btn-primary disabled:opacity-50">
            {loading
              ? isEditing
                ? 'Saving Changes...'
                : 'Creating Asset...'
              : isEditing
              ? 'Save Changes'
              : 'Save Equipment & Issue QR'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
