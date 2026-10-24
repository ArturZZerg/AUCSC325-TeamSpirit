import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import type { HeatmapDay } from '@campusflow/domain';
import { colors } from '@/components/ui';

const shortDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' });
const niceTicks = (min: number, max: number) => {
  if (min === max) return [min - 1, min, min + 1];
  const step = (max - min) / 2;
  return [min, min + step, max].map(value => Math.round(value * 10) / 10);
};

export interface LinePoint { date: string; value: number; secondary?: number }
/**
 * One series as a 2px line with markers; an optional second series (the trend)
 * is drawn as faint dots underneath and named in the legend. Tap reads a value.
 */
export function LineChart({ points, unit, label, secondaryLabel, height = 160 }: { points: readonly LinePoint[]; unit: string; label: string; secondaryLabel?: string; height?: number }) {
  const [width, setWidth] = useState(0); const [selected, setSelected] = useState<number>();
  if (!points.length) return null;
  const values = points.flatMap(point => [point.value, ...(point.secondary === undefined ? [] : [point.secondary])]);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const low = ticks[0], high = ticks[ticks.length - 1], left = 50, right = 12, top = 10, bottom = 22;
  const x = (index: number) => points.length === 1 ? (left + width - right) / 2 : left + (index / (points.length - 1)) * (width - left - right);
  const y = (value: number) => top + (1 - (value - low) / (high - low || 1)) * (height - top - bottom);
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
  const active = selected === undefined ? points.length - 1 : selected;
  const pick = (locationX: number) => setSelected(Math.max(0, Math.min(points.length - 1, Math.round(((locationX - left) / Math.max(1, width - left - right)) * (points.length - 1)))));
  return <View accessibilityLabel={`${label}: ${points.map(point => `${shortDate(point.date)} ${point.value} ${unit}`).join(', ')}`}>
    <View style={styles.readout}><Text style={styles.readValue}>{points[active].value} {unit}</Text>
      <Text style={styles.readMeta}>{shortDate(points[active].date)}{points[active].secondary !== undefined && secondaryLabel ? ` · ${secondaryLabel} ${points[active].secondary} ${unit}` : ''}</Text></View>
    <Pressable accessibilityRole="adjustable" accessibilityHint="Tap the chart to read a point" onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      onPress={event => pick(event.nativeEvent.locationX)} style={{ height }}>
      {width > 0 && <Svg width={width} height={height}>
        {ticks.map(tick => <Line key={tick} x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke={colors.line} strokeWidth={1}/>)}
        {points.map((point, index) => point.secondary === undefined ? null
          : <Circle key={`s${index}`} cx={x(index)} cy={y(point.secondary)} r={3} fill={colors.faint}/>)}
        <Path d={path} stroke={colors.moss} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round"/>
        {points.length <= 40 && points.map((point, index) => <Circle key={index} cx={x(index)} cy={y(point.value)} r={index === active ? 5 : 3}
          fill={index === active ? colors.moss : colors.card} stroke={colors.moss} strokeWidth={2}/>)}
        <Line x1={x(active)} x2={x(active)} y1={top} y2={height - bottom} stroke={colors.muted} strokeWidth={1} strokeDasharray="3 3"/>
      </Svg>}
      {ticks.map(tick => <Text key={tick} style={[styles.tick, { top: y(tick) - 8 }]}>{tick}</Text>)}
      <Text style={[styles.axis, { left }]}>{shortDate(points[0].date)}</Text>
      {points.length > 1 && <Text style={[styles.axis, { right }]}>{shortDate(points[points.length - 1].date)}</Text>}
    </Pressable>
    {secondaryLabel && <View style={styles.legend}><View style={styles.legendLine}/><Text style={styles.legendText}>{label}</Text>
      <View style={styles.legendDot}/><Text style={styles.legendText}>{secondaryLabel}</Text></View>}
  </View>;
}

/** One hue, light to dark by sets done that day; today outlined. Tap a day to read it. */
export function Heatmap({ weeks, today }: { weeks: readonly (readonly HeatmapDay[])[]; today: string }) {
  const [selected, setSelected] = useState<HeatmapDay>();
  const shade = (day: HeatmapDay) => day.future ? 'transparent' : !day.sets ? colors.line : colors.moss;
  const opacity = (day: HeatmapDay) => !day.sets ? 1 : day.sets < 10 ? 0.35 : day.sets < 18 ? 0.6 : day.sets < 25 ? 0.82 : 1;
  const total = weeks.flat().filter(day => day.workouts).length;
  return <View accessibilityLabel={`${total} training days in the last ${weeks.length} weeks`}>
    <View style={styles.heatmap}>
      <View style={styles.dayLabels}>{['M', '', 'W', '', 'F', '', 'S'].map((value, index) => <Text key={index} style={styles.dayLabel}>{value}</Text>)}</View>
      {weeks.map(week => <View key={week[0].date} style={styles.week}>{week.map(day => <Pressable key={day.date} accessibilityRole="button"
        accessibilityLabel={`${shortDate(day.date)}: ${day.workouts ? `${day.sets} sets` : 'rest'}`} disabled={day.future} onPress={() => setSelected(day)}
        style={[styles.cell, { backgroundColor: shade(day), opacity: opacity(day) }, day.date === today && styles.today, selected?.date === day.date && styles.selectedCell]}/>)}</View>)}
    </View>
    <View style={styles.heatFooter}>
      <Text style={styles.readMeta}>{selected ? `${shortDate(selected.date)} · ${selected.workouts ? `${selected.sets} sets` : 'Rest day'}` : `${total} training days`}</Text>
      <View style={styles.scale}><Text style={styles.legendText}>Less</Text>{[0, 5, 12, 20, 30].map(sets =>
        <View key={sets} style={[styles.scaleCell, { backgroundColor: sets ? colors.moss : colors.line, opacity: opacity({ date: '', workouts: 1, sets, future: false }) }]}/>)}
        <Text style={styles.legendText}>More</Text></View>
    </View>
  </View>;
}

/** Thin horizontal bars with the value in ink; the faint track marks the common 10–20 weekly-set range. */
export function MuscleBars({ rows }: { rows: readonly { label: string; value: number }[] }) {
  const max = Math.max(20, ...rows.map(row => row.value));
  return <View style={styles.bars}>{rows.map(row => <View key={row.label} style={styles.barRow} accessibilityLabel={`${row.label}: ${row.value} sets`}>
    <Text style={styles.barLabel}>{row.label}</Text>
    <View style={styles.track}>
      <View style={[styles.band, { left: `${(10 / max) * 100}%`, width: `${(10 / max) * 100}%` }]}/>
      <Svg width="100%" height={10} style={StyleSheet.absoluteFill}><Rect x={0} y={0} width={`${Math.max(2, (row.value / max) * 100)}%`} height={10} rx={4} fill={colors.moss}/></Svg>
    </View>
    <Text style={styles.barValue}>{Number.isInteger(row.value) ? row.value : row.value.toFixed(1)}</Text>
  </View>)}</View>;
}

const styles = StyleSheet.create({
  readout: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  readValue: { color: colors.ink, fontWeight: '900', fontSize: 20 }, readMeta: { color: colors.muted, fontSize: 13 },
  tick: { position: 'absolute', left: 0, width: 40, textAlign: 'right', color: colors.muted, fontSize: 11 },
  axis: { position: 'absolute', bottom: 0, color: colors.muted, fontSize: 11 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  legendLine: { width: 16, height: 2, borderRadius: 1, backgroundColor: colors.moss }, legendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.faint, marginLeft: 8 },
  legendText: { color: colors.muted, fontSize: 12 },
  heatmap: { flexDirection: 'row', gap: 3 }, dayLabels: { gap: 3, marginRight: 2 }, dayLabel: { color: colors.muted, fontSize: 9, height: 14, lineHeight: 14 },
  week: { gap: 3, flex: 1, maxWidth: 18 }, cell: { height: 14, borderRadius: 3 },
  today: { borderWidth: 1.5, borderColor: colors.ink }, selectedCell: { borderWidth: 2, borderColor: colors.blue },
  heatFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' },
  scale: { flexDirection: 'row', alignItems: 'center', gap: 3 }, scaleCell: { width: 10, height: 10, borderRadius: 2 },
  bars: { gap: 8 }, barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { color: colors.ink, width: 88, fontSize: 13 }, barValue: { color: colors.ink, width: 34, textAlign: 'right', fontWeight: '700', fontSize: 13 },
  track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.sage, overflow: 'hidden' },
  band: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.line, opacity: 0.6 },
});
