'use strict';

const { z } = require('zod');

// ── Shared primitives ─────────────────────────────────────────────────────────

const objectIdString = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid ObjectId (24 hex chars)');

const isoDate = z
  .string()
  .refine((v) => !isNaN(Date.parse(v)), { message: 'Must be a valid ISO 8601 date string' });

// ── Auth ─────────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email('Must be a valid email'),
  password: z.string().min(1, 'Password is required'),
});

// ── Equipment ─────────────────────────────────────────────────────────────────

const locationSchema = z.object({
  site: z.string().min(1),
  building: z.string().min(1),
  zone: z.string().min(1),
});

const EQUIPMENT_CATEGORIES = ['Pump', 'Generator', 'Compressor', 'HVAC', 'Electrical', 'Other'];

const createEquipmentSchema = z.object({
  equipmentCode: z.string().min(1, 'equipmentCode is required'),
  name: z.string().min(1, 'name is required'),
  category: z.enum(EQUIPMENT_CATEGORIES, {
    errorMap: () => ({ message: `category must be one of: ${EQUIPMENT_CATEGORIES.join(', ')}` }),
  }),
  manufacturer: z.string().min(1),
  model: z.string().min(1),
  serialNumber: z.string().optional(),
  installationDate: isoDate,
  location: locationSchema,
  maintenanceIntervalDays: z
    .number({ invalid_type_error: 'maintenanceIntervalDays must be a number' })
    .int()
    .positive('maintenanceIntervalDays must be a positive integer'),
  assignedTechnicianId: objectIdString.optional(),
  isPublicVisible: z.boolean().optional(),
  notes: z.string().optional(),
});

const patchEquipmentSchema = z
  .object({
    equipmentCode: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    category: z.enum(EQUIPMENT_CATEGORIES).optional(),
    manufacturer: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    serialNumber: z.string().optional(),
    location: locationSchema.optional(),
    maintenanceIntervalDays: z.number().int().positive().optional(),
    assignedTechnicianId: objectIdString.nullable().optional(),
    isPublicVisible: z.boolean().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

const retireEquipmentSchema = z.object({
  reason: z.string().optional(),
});

const regenerateQRSchema = z.object({
  reason: z.string().optional(),
});

// replace body = full new equipment definition (same as create)
const replaceEquipmentSchema = createEquipmentSchema;

// ── Maintenance ───────────────────────────────────────────────────────────────

const MAINTENANCE_TYPES = ['Scheduled', 'Preventive', 'Corrective', 'Inspection'];

const createMaintenanceSchema = z.object({
  type: z.enum(MAINTENANCE_TYPES, {
    errorMap: () => ({ message: `type must be one of: ${MAINTENANCE_TYPES.join(', ')}` }),
  }),
  performedByTechnicianId: objectIdString,
  date: isoDate,
  description: z.string().min(1),
  partsUsed: z.array(z.string()).optional(),
  nextRecommendedDate: isoDate.optional(),
  attachments: z
    .array(z.object({ filename: z.string().min(1), url: z.string().url() }))
    .optional(),
});

// ── Faults ────────────────────────────────────────────────────────────────────

const FAULT_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

const createFaultSchema = z.object({
  reportedDate: isoDate,
  severity: z.enum(FAULT_SEVERITIES, {
    errorMap: () => ({ message: `severity must be one of: ${FAULT_SEVERITIES.join(', ')}` }),
  }),
  description: z.string().min(1),
});

const RESOLVABLE_STATUSES = ['In Progress', 'Resolved'];

const resolveFaultSchema = z
  .object({
    status: z.enum(RESOLVABLE_STATUSES, {
      errorMap: () => ({ message: `status must be one of: ${RESOLVABLE_STATUSES.join(', ')}` }),
    }),
    resolutionNotes: z.string().min(1).optional(),
    resolvedDate: isoDate.optional(),
    linkedMaintenanceEventId: objectIdString.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'Resolved') {
      if (!data.resolutionNotes) {
        ctx.addIssue({
          path: ['resolutionNotes'],
          code: z.ZodIssueCode.custom,
          message: 'resolutionNotes is required when status is Resolved',
        });
      }
      if (!data.resolvedDate) {
        ctx.addIssue({
          path: ['resolvedDate'],
          code: z.ZodIssueCode.custom,
          message: 'resolvedDate is required when status is Resolved',
        });
      }
    }
  });

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  loginSchema,
  createEquipmentSchema,
  patchEquipmentSchema,
  retireEquipmentSchema,
  regenerateQRSchema,
  replaceEquipmentSchema,
  createMaintenanceSchema,
  createFaultSchema,
  resolveFaultSchema,
};
