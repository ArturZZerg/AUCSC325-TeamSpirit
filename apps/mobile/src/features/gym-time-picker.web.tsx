import { colors } from '@/components/ui';
import { parseGymTime } from './gym-opening-hours-form';

type Props = { label: string; value: string; disabled: boolean; onChange(value: string): void };

/** Browsers provide their native time control; the adjacent text field is always available. */
export function GymTimePicker({ label, value, disabled, onChange }: Props) {
  return <input type="time" aria-label={`Choose ${label.toLowerCase()}`} disabled={disabled} step={60}
    value={parseGymTime(value)?.time ?? ''} onChange={event => { if (event.target.value) onChange(event.target.value); }}
    style={{ minHeight: 46, maxWidth: 140, boxSizing: 'border-box', border: `1px solid ${colors.line}`, borderRadius: 10,
      padding: '6px 10px', color: colors.ink, background: colors.card, outlineColor: colors.moss }}/>;
}
