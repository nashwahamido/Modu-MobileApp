import Svg, { Circle, Defs, FeDropShadow, Filter, G, Line, Path, Polyline, Rect } from 'react-native-svg';

type Props = { size?: number; color?: string };
const base = (size = 28) => ({ width: size, height: size, viewBox: '0 0 24 24' });

export function SettingsIcon({ size = 40, color = '#7b7175' }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 64 64">
    <Rect x="27" y="2" width="10" height="18" rx="2.4" fill={color}/>
    <Rect x="27" y="44" width="10" height="18" rx="2.4" fill={color}/>
    <Rect x="44" y="27" width="18" height="10" rx="2.4" fill={color}/>
    <Rect x="2" y="27" width="18" height="10" rx="2.4" fill={color}/>
    <Rect x="27" y="2" width="10" height="18" rx="2.4" fill={color} transform="rotate(45 32 32)"/>
    <Rect x="27" y="44" width="10" height="18" rx="2.4" fill={color} transform="rotate(45 32 32)"/>
    <Rect x="44" y="27" width="18" height="10" rx="2.4" fill={color} transform="rotate(45 32 32)"/>
    <Rect x="2" y="27" width="18" height="10" rx="2.4" fill={color} transform="rotate(45 32 32)"/>
    <Circle cx="32" cy="32" r="22" fill={color}/>
    <Circle cx="32" cy="32" r="13.5" fill="#f6efe4"/>
    <Circle cx="32" cy="32" r="7.3" fill={color}/>
  </Svg>;
}
export function CartIcon({ size = 31, color = '#807277' }: Props) {
  return <Svg {...base(size)}>
    <Path d="M3.5 4.2h17l-2.6 7.3H8.1v2.1c0 1.9 1.5 3.4 3.4 3.4h6.8v2H11c-3.1 0-5.5-2.4-5.5-5.5V7.1l-2-2.9Z" fill={color}/>
    <Circle cx="9.2" cy="21" r="1.55" fill={color}/><Circle cx="17.2" cy="21" r="1.55" fill={color}/>
  </Svg>;
}
export function InventoryIcon({ size = 32, color = '#807277' }: Props) {
  return <Svg {...base(size)}>
    <Rect x="2.6" y="4.2" width="18.8" height="5.1" rx="1.5" fill="#353130"/>
    <Path d="M5.1 9.3h13.8v11.2H5.1Z" fill={color}/>
    <Rect x="9.1" y="8.1" width="5.8" height="3.2" rx="1.15" fill="#eee8e5"/>
  </Svg>;
}
export function FriendsIcon({ size = 34, color = '#807277' }: Props) {
  return <Svg {...base(size)} fill={color}>
    <Circle cx="8.2" cy="7.2" r="3.5"/><Circle cx="16.9" cy="7.8" r="3"/>
    <Path d="M1.9 18.4c0-4.1 2.5-6.5 6.5-6.5s6.5 2.4 6.5 6.5v1.2h-13v-1.2Zm14.1-5.5c3.8.1 6.1 2.3 6.1 5.9 0 2.2-1.2 3.5-3.3 3.5h-2.9v-3.1h2.1c.7 0 1-.4 1-1.1 0-1.7-1-2.8-3-3.1v-2.1Z"/>
  </Svg>;
}
export function ToolsIcon({ size = 31, color = '#807277' }: Props) {
  return <Svg {...base(size)} fill="none" stroke={color} strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round">
    <Path d="m6.2 5.8 12 12"/>
    <Circle cx="5.1" cy="4.8" r="2.7" fill={color} stroke="none"/><Circle cx="5.1" cy="4.8" r="1.05" fill="#fffef9" stroke="none"/>
    <Circle cx="19.1" cy="18.8" r="2.7" fill={color} stroke="none"/><Circle cx="19.1" cy="18.8" r="1.05" fill="#fffef9" stroke="none"/>
    <Path d="m6.5 18 10.8-10.8M4.2 20.3l3.1-1.1-2-2-1.1 3.1ZM19.8 3.7l-3.1 1.1 2 2 1.1-3.1Z" fill={color}/>
  </Svg>;
}
export function ChevronIcon({ size = 28, color = '#807277', up = false, outlineColor, outlineWidth = 1.5, shadow = false }: Props & { up?: boolean; outlineColor?: string; outlineWidth?: number; shadow?: boolean }) {
  // Fill plus a same-colour stroke, whose round linejoin softens the corners.
  const d = up ? 'M2.6 17.2 12 6.8l9.4 10.4H2.6Z' : 'M2.6 6.8 12 17.2l9.4-10.4H2.6Z';
  // A REAL drop shadow, shaped to the arrow. RN's own boxShadow and elevation follow a view's border
  // box, so on a transparent triangle they cast a rectangle — an SVG filter is what makes the shadow
  // the shape of the thing casting it. Matched to CARD_CHROME (0 5 4 rgba(0,0,0,0.22)); a CSS blur
  // radius is roughly twice the Gaussian deviation, hence 2. The filter region is oversized because
  // the default (-10%) would clip the blur off at the glyph's own edges.
  const body = <>
    {/* Behind the arrow, at its width plus twice the outline, so only the outer half shows.
        Stroking the arrow itself would eat inward and change its shape. */}
    {outlineColor ? <Path d={d} fill="none" stroke={outlineColor} strokeWidth={2 + outlineWidth * 2} strokeLinejoin="round"/> : null}
    <Path d={d} fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round"/>
  </>;
  return <Svg {...base(size)}>
    {shadow ? <Defs>
      <Filter id="chevronDrop" x="-50%" y="-50%" width="200%" height="200%">
        <FeDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#000" floodOpacity="0.22"/>
      </Filter>
    </Defs> : null}
    {shadow ? <G filter="url(#chevronDrop)">{body}</G> : body}
  </Svg>;
}
// A back arrow for a round button. The points are chosen so the ANGLE'S OWN BOX is centred on the
// 24x24 viewBox — x runs 8.75..15.25 and y 5..19, both centred on 12 — and the stroke grows evenly
// around it, so the glyph sits in the middle of whatever disc it is dropped into. That is the whole
// reason this exists rather than a "‹" in a Text: a typed chevron carries the font's own side bearings
// and baseline, which put it off-centre in a circle, and the fix was hand-tuned margins that only held
// for one font at one size.
export function BackIcon({ size = 22, color = '#231F20' }: Props) { return <Svg {...base(size)} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><Polyline points="15.25,5 8.75,12 15.25,19"/></Svg> }
export function CheckIcon({ size, color = '#555' }: Props) { return <Svg {...base(size)} fill="none" stroke={color} strokeWidth="2.5"><Polyline points="4,12 9,17 20,6"/></Svg> }
export function CloseIcon({ size, color = '#555' }: Props) { return <Svg {...base(size)} fill="none" stroke={color} strokeWidth="2.5"><Line x1="5" y1="5" x2="19" y2="19"/><Line x1="19" y1="5" x2="5" y2="19"/></Svg> }
export function StarIcon({ size, color = '#555' }: Props) { return <Svg {...base(size)} fill={color}><Path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5-4.7-4.6 6.5-.9L12 2.5Z"/></Svg> }
export function RotateLeftIcon({ size, color = '#555' }: Props) { return <Svg {...base(size)} fill="none" stroke={color} strokeWidth="2"><Path d="M4 8V3m0 0h5M4 3l4 4"/><Path d="M5.5 9.5A7 7 0 1 0 9 5.6"/></Svg> }
export function RotateRightIcon({ size, color = '#555' }: Props) { return <Svg {...base(size)} fill="none" stroke={color} strokeWidth="2"><Path d="M20 8V3m0 0h-5m5 0-4 4"/><Path d="M18.5 9.5A7 7 0 1 1 15 5.6"/></Svg> }
export function TrashIcon({ size, color = '#555' }: Props) { return <Svg {...base(size)} fill="none" stroke={color} strokeWidth="2"><Path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7"/><Line x1="10" y1="11" x2="10" y2="17"/><Line x1="14" y1="11" x2="14" y2="17"/></Svg> }
export function LevelStarIcon({ size = 48 }: Props) { return <Svg {...base(size)}><Path d="M12 1.25 15.05 8l7.35.75-5.45 5 1.48 7.25L12 17.35 5.57 21l1.48-7.25-5.45-5L8.95 8 12 1.25Z" fill="#927fb1" stroke="#75658d" strokeWidth=".72" strokeLinejoin="round"/></Svg> }
export function CoinMedalIcon({ size = 44 }: Props) { return <Svg {...base(size)}><Circle cx="12" cy="12" r="10.25" fill="#ead58b" stroke="#c6ad5e" strokeWidth=".8"/><Path d="m12 3.5 2.38 4.94 5.42.72-3.94 3.82.98 5.38L12 15.8l-4.86 2.56.98-5.38-3.94-3.82 5.42-.72L12 3.5Z" fill="#fff3bd" stroke="#fff9df" strokeWidth=".55" strokeLinejoin="round"/></Svg> }


/** Build stages — a rising step line, matching the "N stages" row on a catalogue card. */
export function StagesIcon({ size = 24, color = '#807277' }: Props) { return <Svg {...base(size)} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"><Polyline points="3,17 9,11 13,15 21,7"/><Polyline points="15,7 21,7 21,13"/></Svg> }

/** Estimated build time — the clock on a catalogue card. */
export function ClockIcon({ size = 24, color = '#807277' }: Props) { return <Svg {...base(size)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><Circle cx="12" cy="12" r="8.5"/><Polyline points="12,7 12,12 15.5,14"/></Svg> }

// Filled when lit, outline when not: the bulb IS the switch's state readout, so the two states have to differ at a glance and not only by tint.
export function BulbIcon({ size = 24, color = '#807277', on = false }: Props & { on?: boolean }) {
  return <Svg {...base(size)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M9 16.8a6 6 0 1 1 6 0V18a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 18v-1.2Z" fill={on ? color : 'none'}/>
    <Line x1="9.6" y1="21" x2="14.4" y2="21"/>
  </Svg>;
}
export function SunIcon({ size = 24, color = '#807277' }: Props) {
  return <Svg {...base(size)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
    <Circle cx="12" cy="12" r="4.4"/>
    <Path d="M12 2.2v2.4M12 19.4v2.4M2.2 12h2.4M19.4 12h2.4M5.1 5.1l1.7 1.7M17.2 17.2l1.7 1.7M18.9 5.1l-1.7 1.7M6.8 17.2l-1.7 1.7"/>
  </Svg>;
}
export function MoonIcon({ size = 24, color = '#807277' }: Props) {
  return <Svg {...base(size)} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round">
    <Path d="M20 14.6A8.6 8.6 0 0 1 9.4 4a8.6 8.6 0 1 0 10.6 10.6Z"/>
  </Svg>;
}