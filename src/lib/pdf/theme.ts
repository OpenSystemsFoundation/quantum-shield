import { rgb } from 'pdf-lib';
import type { Severity } from './types.js';

export const PAGE = {
  width: 595.28,
  height: 841.89,
  marginX: 54,
  marginTop: 72,
  marginBottom: 56,
};

export const COLORS = {
  ink: rgb(0.043, 0.059, 0.078),
  inkSoft: rgb(0.102, 0.133, 0.176),
  muted: rgb(0.36, 0.42, 0.49),
  hairline: rgb(0.86, 0.88, 0.91),
  panel: rgb(0.96, 0.97, 0.98),
  accent: rgb(0.0, 0.341, 0.624), // OpenSF primary #00579f
  accentSoft: rgb(0.902, 0.945, 0.984), // OpenSF primary-soft #e6f1fb
  white: rgb(1, 1, 1),
  critical: rgb(0.69, 0.0, 0.125),
  high: rgb(0.85, 0.369, 0.0),
  medium: rgb(0.71, 0.506, 0.0),
  low: rgb(0.165, 0.498, 0.384),
};

export const FONT = {
  body: 10,
  small: 8.5,
  micro: 7.5,
  h1: 28,
  h2: 16,
  h3: 12,
  lead: 11.5,
  leading: 1.35,
};

export function severityColor(severity: Severity) {
  switch (severity) {
    case 'critical':
      return COLORS.critical;
    case 'high':
      return COLORS.high;
    case 'medium':
      return COLORS.medium;
    case 'low':
      return COLORS.low;
  }
}

export function severityLabel(severity: Severity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}
