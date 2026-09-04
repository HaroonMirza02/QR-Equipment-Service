import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { resolveImageUrl, resolveProfileUrl } from '../../api/client';
import { Download, RefreshCw, ExternalLink, QrCode } from 'lucide-react';

interface QRData {
  id: string;
  equipmentCode: string;
  name: string;
  qrCodeUrl: string;
  profileUrl: string;
}

interface QRManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  qrData: QRData | null;
  onRegenerate: (equipmentId: string) => Promise<void>;
}

export const QRManagerModal: React.FC<QRManagerModalProps> = ({
  isOpen,
  onClose,
  qrData,
  onRegenerate,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmingRegen, setConfirmingRegen] = useState(false);

  if (!qrData) return null;

  const resolvedQrUrl = resolveImageUrl(qrData.qrCodeUrl);

  const handleRegenerateClick = async () => {
    if (!confirmingRegen) {
      setConfirmingRegen(true);
      return;
    }

    setError('');
    setLoading(true);

    try {
      await onRegenerate(qrData.id);
      setConfirmingRegen(false);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('Failed to regenerate QR code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setConfirmingRegen(false);
        onClose();
      }}
      title={`${qrData.equipmentCode} · Physical QR Label`}
      subtitle={qrData.name}
      maxWidth="md"
    >
      <div className="space-y-6 text-center font-['IBM_Plex_Sans',sans-serif]">
        {error && (
          <div className="p-3 bg-[#fff0f1] border-l-4 border-[#da1e28] text-[#da1e28] text-xs font-semibold text-left">
            {error}
          </div>
        )}

        {/* Carbon Physical Label Card */}
        <div className="bg-[#161616] text-white p-6 rounded-none border border-[#393939] max-w-sm mx-auto flex flex-col items-center">
          <div className="w-48 h-48 bg-white p-3 rounded-none flex items-center justify-center mb-4 overflow-hidden border border-[#e0e0e0]">
            <img
              src={resolvedQrUrl}
              alt={`QR code for ${qrData.equipmentCode}`}
              className="w-full h-full object-contain"
            />
          </div>

          <span className="text-[10px] font-mono font-bold text-[#78a9ff] uppercase tracking-widest">
            PlantOps Asset Identity Label
          </span>
          <strong className="text-xl font-mono font-bold text-white tracking-wide mt-1">
            {qrData.equipmentCode}
          </strong>
          <p className="text-xs text-[#c6c6c6] font-medium truncate max-w-xs">{qrData.name}</p>
          <span className="text-[10px] text-[#a8a8a8] mt-2 font-mono">
            Scan with camera to open mobile passport
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <a
            href={resolvedQrUrl}
            download={`${qrData.equipmentCode}-QR.png`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 carbon-btn-primary text-xs sm:text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Download PNG Label
          </a>

          <a
            href={resolveProfileUrl(qrData.profileUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 carbon-btn-tertiary text-xs sm:text-sm font-medium"
          >
            <ExternalLink className="w-4 h-4" />
            Test Mobile View
          </a>
        </div>

        {/* Regenerate Token Box */}
        <div className="border-t border-[#e0e0e0] pt-4 text-left">
          <div className="p-3 bg-[#fcf4d6] border border-[#f1c21b] rounded-none text-xs text-[#161616] flex items-start gap-3">
            <QrCode className="w-5 h-5 text-[#b28600] shrink-0 mt-0.5" />
            <div>
              <p className="font-bold uppercase tracking-wider text-[11px]">Revoke & Regenerate QR Token</p>
              <p className="text-[#393939] mt-0.5 text-xs">
                If printed label is damaged or compromised, regenerating the QR will invalidate the old printed QR code immediately.
              </p>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRegenerateClick}
                  disabled={loading}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-none font-semibold text-xs transition-colors text-white ${
                    confirmingRegen ? 'bg-[#da1e28] hover:bg-[#b81921]' : 'bg-[#b28600] hover:bg-[#8c6900]'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  {confirmingRegen ? 'Click to Confirm Invalidation' : 'Regenerate QR Code'}
                </button>

                {confirmingRegen && (
                  <button
                    type="button"
                    onClick={() => setConfirmingRegen(false)}
                    className="px-2.5 py-1.5 text-xs text-[#525252] hover:text-[#161616]"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
