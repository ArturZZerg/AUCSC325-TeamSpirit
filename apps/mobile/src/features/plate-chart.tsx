import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, Pattern, Rect } from 'react-native-svg';
import type { Nutrients } from '@campusflow/contracts';
import { colorScheme, colors } from '@/components/ui';

export type Macro = 'carbs' | 'protein' | 'fiber' | 'fat';
/**
 * Validated categorical slots 1–4 (dataviz palette), in ring order so only
 * distinguishable hues touch; every sector also carries its own texture and a label.
 */
export const macroColors: Record<Macro, string> = colorScheme === 'dark'
  ? { carbs: '#3987e5', protein: '#d95926', fiber: '#199e70', fat: '#c98500' }
  : { carbs: '#2a78d6', protein: '#eb6834', fiber: '#1baf7a', fat: '#eda100' };
export const macroLabels: Record<Macro, string> = { carbs: 'Carbs', protein: 'Protein', fiber: 'Fiber', fat: 'Fat' };
const order: Macro[] = ['carbs', 'protein', 'fiber', 'fat'];

/** Food motifs drawn inside each filled sector: rice grains, eggs, leaves and oil droplets. */
function Motif({ macro }: { macro: Macro }) {
  const base = macroColors[macro], light = 'rgba(255,255,255,0.78)', soft = 'rgba(255,255,255,0.35)';
  return <Pattern id={`p-${macro}`} patternUnits="userSpaceOnUse" width={18} height={18}>
    <Rect width={18} height={18} fill={base}/>
    {macro === 'carbs' && <G>
      <Ellipse cx={5} cy={5} rx={3.2} ry={1.4} fill={light} transform="rotate(-30 5 5)"/><Ellipse cx={13} cy={12} rx={3.2} ry={1.4} fill={light} transform="rotate(25 13 12)"/>
      <Ellipse cx={4} cy={14} rx={2.6} ry={1.1} fill={soft} transform="rotate(60 4 14)"/></G>}
    {macro === 'protein' && <G>
      <Ellipse cx={6} cy={6} rx={4} ry={3.2} fill={light}/><Circle cx={6.4} cy={6.2} r={1.5} fill="#F6C343"/>
      <Ellipse cx={14} cy={14} rx={3} ry={2.4} fill={soft}/></G>}
    {macro === 'fiber' && <G>
      <Path d="M3 12 C 5 5, 11 4, 12 4 C 12 9, 9 13, 3 12 Z" fill={light}/><Path d="M3.5 11.5 L 11 5" stroke={base} strokeWidth={0.8}/>
      <Path d="M11 17 C 12 13, 15.5 12, 16.5 12 C 16.5 15, 14.5 17.5, 11 17 Z" fill={soft}/></G>}
    {macro === 'fat' && <G>
      <Path d="M6 2 C 6 2, 2 7.5, 2 9.5 A 4 4 0 0 0 10 9.5 C 10 7.5, 6 2, 6 2 Z" fill={light}/><Circle cx={4.6} cy={9.6} r={0.9} fill={base}/>
      <Path d="M14 10 C 14 10, 11.5 13.4, 11.5 14.6 A 2.5 2.5 0 0 0 16.5 14.6 C 16.5 13.4, 14 10, 14 10 Z" fill={soft}/></G>}
  </Pattern>;
}

const point = (cx: number, cy: number, radius: number, degrees: number) => {
  const angle = (degrees - 90) * Math.PI / 180;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)] as const;
};
/** An annular wedge between two radii and two angles (degrees, clockwise from 12 o'clock). */
const wedge = (cx: number, cy: number, inner: number, outer: number, from: number, to: number) => {
  const [ax, ay] = point(cx, cy, outer, from), [bx, by] = point(cx, cy, outer, to), [cx2, cy2] = point(cx, cy, inner, to), [dx, dy] = point(cx, cy, inner, from);
  return `M${ax},${ay} A${outer},${outer} 0 0 1 ${bx},${by} L${cx2},${cy2} A${inner},${inner} 0 0 0 ${dx},${dy} Z`;
};

/**
 * The day as a plate: four equal sectors fill outward as each nutrient
 * approaches its goal; the centre shows calories. Values are always written
 * out below, so nothing depends on color or texture alone.
 */
export function PlateChart({ eaten, goals, size = 260 }: { eaten: Nutrients; goals: Nutrients | null; size?: number }) {
  const center = size / 2, rim = size / 2 - 2, plate = rim - 10, inner = plate * 0.36;
  const progress = (macro: Macro) => goals && goals[macro] > 0 ? Math.min(1, eaten[macro] / goals[macro]) : 0;
  const kcalLeft = goals ? Math.round(goals.kcal - eaten.kcal) : null;
  return <View accessibilityRole="image" accessibilityLabel={`Today: ${Math.round(eaten.kcal)} kcal${goals ? ` of ${goals.kcal}` : ''}. ${order.map(macro =>
    `${macroLabels[macro]} ${eaten[macro]} grams${goals ? ` of ${goals[macro]}` : ''}`).join(', ')}.`}>
    <View style={styles.center}>
      <Svg width={size} height={size}>
        <Defs>{order.map(macro => <Motif key={macro} macro={macro}/>)}</Defs>
        <Circle cx={center} cy={center} r={rim} fill={colors.card} stroke={colors.line} strokeWidth={2}/>
        <Circle cx={center} cy={center} r={plate} fill={colors.canvas}/>
        {order.map((macro, index) => { const from = index * 90 + 1.5, to = (index + 1) * 90 - 1.5, filled = progress(macro);
          return <G key={macro}>
            <Path d={wedge(center, center, inner, plate - 2, from, to)} fill={macroColors[macro]} opacity={0.14}/>
            {filled > 0 && <Path d={wedge(center, center, inner, inner + (plate - 2 - inner) * filled, from, to)} fill={`url(#p-${macro})`}/>}
          </G>; })}
        <Circle cx={center} cy={center} r={inner - 3} fill={colors.card} stroke={colors.line} strokeWidth={1}/>
      </Svg>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.middle]}>
        <Text style={styles.kcal}>{Math.round(eaten.kcal).toLocaleString()}</Text>
        <Text style={styles.kcalUnit}>{goals ? `of ${goals.kcal.toLocaleString()} kcal` : 'kcal'}</Text>
        {kcalLeft !== null && <Text style={[styles.left, kcalLeft < 0 && styles.over]}>{kcalLeft >= 0 ? `${kcalLeft.toLocaleString()} left` : `${(-kcalLeft).toLocaleString()} over`}</Text>}
      </View>
    </View>
    <View style={styles.legend}>{order.map(macro => <View key={macro} style={styles.legendItem}>
      <Svg width={22} height={22}><Defs><Motif macro={macro}/></Defs><Rect width={22} height={22} rx={6} fill={`url(#p-${macro})`}/></Svg>
      <View style={styles.legendText}><Text style={styles.legendName}>{macroLabels[macro]}</Text>
        <Text style={styles.legendValue}>{Math.round(eaten[macro])}{goals ? ` / ${goals[macro]}` : ''} g</Text></View>
    </View>)}</View>
  </View>;
}

const styles = StyleSheet.create({
  center: { alignSelf: 'center' }, middle: { alignItems: 'center', justifyContent: 'center' },
  kcal: { color: colors.ink, fontSize: 28, fontWeight: '900' }, kcalUnit: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  left: { color: colors.moss, fontSize: 12, fontWeight: '800', marginTop: 2 }, over: { color: colors.danger },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8, flexBasis: '46%', flexGrow: 1 },
  legendText: { gap: 1 }, legendName: { color: colors.ink, fontWeight: '700', fontSize: 13 }, legendValue: { color: colors.muted, fontSize: 13 },
});
