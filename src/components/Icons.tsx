import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

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
export function ChevronIcon({ size = 28, color = '#807277', up = false }: Props & { up?: boolean }) {
  // fill + a same-colour stroke with a round linejoin softens the triangle's corners — a plain
  // fill-only path has no linejoin to round, since there's no stroke outline to apply it to.
  return <Svg {...base(size)}><Path d={up ? 'M2.6 17.2 12 6.8l9.4 10.4H2.6Z' : 'M2.6 6.8 12 17.2l9.4-10.4H2.6Z'} fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round"/></Svg>;
}
export function CheckIcon({ size, color = '#555' }: Props) { return <Svg {...base(size)} fill="none" stroke={color} strokeWidth="2.5"><Polyline points="4,12 9,17 20,6"/></Svg> }
export function CloseIcon({ size, color = '#555' }: Props) { return <Svg {...base(size)} fill="none" stroke={color} strokeWidth="2.5"><Line x1="5" y1="5" x2="19" y2="19"/><Line x1="19" y1="5" x2="5" y2="19"/></Svg> }
export function StarIcon({ size, color = '#555' }: Props) { return <Svg {...base(size)} fill={color}><Path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5-4.7-4.6 6.5-.9L12 2.5Z"/></Svg> }
export function RotateLeftIcon({ size, color = '#555' }: Props) { return <Svg {...base(size)} fill="none" stroke={color} strokeWidth="2"><Path d="M4 8V3m0 0h5M4 3l4 4"/><Path d="M5.5 9.5A7 7 0 1 0 9 5.6"/></Svg> }
export function RotateRightIcon({ size, color = '#555' }: Props) { return <Svg {...base(size)} fill="none" stroke={color} strokeWidth="2"><Path d="M20 8V3m0 0h-5m5 0-4 4"/><Path d="M18.5 9.5A7 7 0 1 1 15 5.6"/></Svg> }
export function TrashIcon({ size, color = '#555' }: Props) { return <Svg {...base(size)} fill="none" stroke={color} strokeWidth="2"><Path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7"/><Line x1="10" y1="11" x2="10" y2="17"/><Line x1="14" y1="11" x2="14" y2="17"/></Svg> }
export function LevelStarIcon({ size = 48 }: Props) { return <Svg {...base(size)}><Path d="M12 1.25 15.05 8l7.35.75-5.45 5 1.48 7.25L12 17.35 5.57 21l1.48-7.25-5.45-5L8.95 8 12 1.25Z" fill="#927fb1" stroke="#75658d" strokeWidth=".72" strokeLinejoin="round"/></Svg> }
export function CoinMedalIcon({ size = 44 }: Props) { return <Svg {...base(size)}><Circle cx="12" cy="12" r="10.25" fill="#ead58b" stroke="#c6ad5e" strokeWidth=".8"/><Path d="m12 3.5 2.38 4.94 5.42.72-3.94 3.82.98 5.38L12 15.8l-4.86 2.56.98-5.38-3.94-3.82 5.42-.72L12 3.5Z" fill="#fff3bd" stroke="#fff9df" strokeWidth=".55" strokeLinejoin="round"/></Svg> }
