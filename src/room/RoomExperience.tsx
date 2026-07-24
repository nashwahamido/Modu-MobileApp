import { useEffect, useMemo, useRef, useState } from 'react';
import { router, useRootNavigationState } from 'expo-router';
import type { Href } from 'expo-router';
import { Animated, Image, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CartIcon, CheckIcon, ChevronIcon, CoinMedalIcon, FriendsIcon, InventoryIcon, LevelStarIcon, RotateLeftIcon, RotateRightIcon, SettingsIcon, TrashIcon } from '../components/Icons';
import { Button } from '../game/ui/Button';
import { DevMenu } from '../game/ui/DevMenu';
import { OverlaySheet } from '../game/ui/OverlaySheet';
import { Theme, useStyles, useTheme } from '../game/ui/theme';
import { RoomScene } from './scene/RoomScene';
import { Cabinet } from './Cabinet';
import { usePlacementStore } from './placement';

// Routes that run their OWN heavy Filament scene. While one of these is on top, the room's engine must be down so only one runs at a time. Lightweight layers (the (presentation) modals: settings, profile, …) are NOT here, so opening them leaves the room mounted — no reload.
const HEAVY_ROUTES = new Set(['play', 'tutorial', 'visit']);

export function RoomExperience() {
  const s = useStyles(makeStyles);
  const t = useTheme();
  // Tear the 3D view down only when a heavy scene is on top, not on every blur. The room screen stays mounted throughout (its placement/zoom UI state survives); only the Filament view unmounts under play/visit and rebuilds on return.
  const rootNav = useRootNavigationState();
  const heavySceneActive = !!rootNav && HEAVY_ROUTES.has(rootNav.routes[rootNav.index]?.name ?? '');
  const { width, height } = useWindowDimensions();
  const [barOpen, setBarOpen] = useState(true);
  // Placement is shared state (src/room/placement) so the Inventory route can start it. The room
  // keeps only the view-layer drag bits (position, pan responder) local.
  const placing = usePlacementStore((p) => p.placing);
  const placed = usePlacementStore((p) => p.placed);
  const startNonce = usePlacementStore((p) => p.startNonce);
  const editPlacement = usePlacementStore((p) => p.editPlacement);
  const confirmPlacement = usePlacementStore((p) => p.confirmPlacement);
  const removePlacement = usePlacementStore((p) => p.removePlacement);
  const [unavailableFeature, setUnavailableFeature] = useState<string | null>(null);
  const [roomRotation, setRoomRotation] = useState(0);
  const [roomZoom, setRoomZoom] = useState(1);
  const roomRotationRef = useRef(roomRotation);
  const roomZoomRef = useRef(roomZoom);
  const zoomPercent = Math.round(roomZoom * 100);
  const rotationDegrees = Math.round(((roomRotation * 180) / Math.PI) % 360);
  const position = useRef(new Animated.ValueXY({ x: width * .47, y: height * .46 })).current;
  const dragStart = useRef({ x: 0, y: 0 });
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => placing,
    onMoveShouldSetPanResponder: (_, g) => placing && (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),
    onPanResponderGrant: () => { position.stopAnimation(v => { dragStart.current = v; }); },
    onPanResponderMove: (_, g) => {
      const x = Math.max(width * .14, Math.min(width * .78, dragStart.current.x + g.dx));
      const y = Math.max(height * .25, Math.min(height * .72, dragStart.current.y + g.dy));
      position.setValue({ x, y });
    },
  }), [height, placing, position, width]);
  const scale = position.y.interpolate({ inputRange: [height * .25, height * .72], outputRange: [.55, 1.18], extrapolate: 'clamp' });

  // A fresh placement (from the Inventory) bumps startNonce — recentre the drag position when it does.
  useEffect(() => {
    if (startNonce > 0) position.setValue({ x: width * .47, y: height * .46 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startNonce]);
  useEffect(() => {
    roomRotationRef.current = roomRotation;
    roomZoomRef.current = roomZoom;
  }, [roomRotation, roomZoom]);
  const applyRoomControls = (nextRotation: number, nextZoom: number) => {
    roomRotationRef.current = nextRotation;
    roomZoomRef.current = nextZoom;
    setRoomRotation(nextRotation);
    setRoomZoom(nextZoom);
  };
  const rotateRoom = (direction: -1 | 1) => {
    applyRoomControls(roomRotationRef.current + direction * Math.PI / 6, roomZoomRef.current);
  };
  const zoomRoom = (direction: 'in' | 'out') => {
    const nextZoom = Math.max(.5, Math.min(1.5, roomZoomRef.current + (direction === 'in' ? .1 : -.1)));
    applyRoomControls(roomRotationRef.current, nextZoom);
  };
  const handleRoomRotationChange = (nextRotation: number) => {
    applyRoomControls(nextRotation, roomZoomRef.current);
  };

  return <View style={s.screen}>
    <View style={s.stage}>{heavySceneActive ? null : <RoomScene rotationY={roomRotation} zoom={roomZoom} onRotationChange={handleRoomRotationChange} />}</View>
    <View style={s.stats}>
      <Pressable accessibilityLabel="Settings" style={s.settingsButton} onPress={() => router.push('/settings' as Href)}><SettingsIcon size={40} color={t.textDim}/></Pressable>
      <Pressable accessibilityLabel="Profile" style={s.levelGroup} onPress={() => router.push('/profile' as Href)}>
        <View style={s.levelBadge}><LevelStarIcon size={48}/><Text style={s.levelNumber}>1</Text></View>
        <View style={s.progress}><View style={s.progressFill}/><Text style={s.progressText}>50%</Text></View>
      </Pressable>
      <View style={s.currencyGroup}>
        <View style={s.coinBadge}><CoinMedalIcon size={44}/></View>
        <View style={s.currency}><Text style={s.currencyText}>6767</Text></View>
      </View>
    </View>

    <View style={s.roomControls}>
      <View style={s.controlGroup}>
        <Pressable accessibilityLabel="Rotate room left" style={({ pressed }) => [s.controlButton, pressed && s.controlButtonPressed]} onPress={() => rotateRoom(-1)}><RotateLeftIcon size={23}/></Pressable>
        <Text style={s.controlReadout}>{rotationDegrees}°</Text>
        <Pressable accessibilityLabel="Rotate room right" style={({ pressed }) => [s.controlButton, pressed && s.controlButtonPressed]} onPress={() => rotateRoom(1)}><RotateRightIcon size={23}/></Pressable>
      </View>
      <View style={s.controlGroup}>
        <Pressable accessibilityLabel="Zoom room in" style={({ pressed }) => [s.controlButton, pressed && s.controlButtonPressed]} onPress={() => zoomRoom('in')}><Text style={s.controlSymbol}>＋</Text></Pressable>
        <Text style={s.controlReadout}>{zoomPercent}%</Text>
        <Pressable accessibilityLabel="Zoom room out" style={({ pressed }) => [s.controlButton, pressed && s.controlButtonPressed]} onPress={() => zoomRoom('out')}><Text style={s.controlSymbol}>－</Text></Pressable>
      </View>
    </View>

    <DevMenu placement="roomFloat" />

    {(placing || placed) ? <Animated.View {...panResponder.panHandlers} style={[s.furnitureWrap,{ transform:[{translateX:position.x},{translateY:position.y},{scale}] }, placing && s.furnitureActive]}><Pressable accessibilityLabel={placing ? 'Selected furniture' : 'Edit furniture'} onPress={editPlacement}><Cabinet/></Pressable></Animated.View> : null}

    <View style={[s.rail,!barOpen&&s.railClosed]}><Pressable accessibilityLabel="Toggle menu" style={[s.chevron,!barOpen&&s.chevronClosed]} onPress={()=>setBarOpen(x=>!x)}><ChevronIcon size={barOpen?28:34} up={barOpen}/></Pressable>{barOpen?<><Pressable style={s.railButton} onPress={()=>router.push('/store' as Href)}><CartIcon size={31}/><Text style={s.railLabel}>shop</Text></Pressable><Pressable style={s.railButton} onPress={()=>router.push('/inventory' as Href)}><InventoryIcon size={32}/><Text style={s.railLabel}>inventory</Text></Pressable><Pressable style={s.railButton} onPress={()=>router.push('/profile' as Href)}><FriendsIcon size={34}/><Text style={s.railLabel}>visit friends</Text></Pressable></>:<View style={s.collapsedPill}/>}</View>
    <Pressable accessibilityLabel="Tasks" style={s.workbench} onPress={()=>router.push('/catalogue' as Href)}><Image source={require('../assets/images/ui/icons/Assemble.png')} style={s.workbenchIcon} resizeMode="contain"/></Pressable>

    {placing ? <View style={s.placeBar}><Text style={s.placeHint}>Drag to position</Text><Pressable accessibilityLabel="Delete furniture" style={s.deleteButton} onPress={removePlacement}><TrashIcon size={23} color={t.danger}/></Pressable><Pressable accessibilityLabel="Confirm furniture position" style={s.confirm} onPress={confirmPlacement}><CheckIcon size={27} color={t.onSuccess}/></Pressable></View>:null}

    {unavailableFeature ? <OverlaySheet size="dialog" onClose={()=>setUnavailableFeature(null)}>
      <Text style={s.comingSoonTitle}>{unavailableFeature}</Text>
      <Text style={s.comingSoonBody}>This feature is coming soon.</Text>
      <Button label="Got it" variant="primary" style={s.comingSoonButton} onPress={()=>setUnavailableFeature(null)}/>
    </OverlaySheet>:null}
  </View>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  screen:{flex:1,backgroundColor:t.bg,overflow:'hidden'},stage:{position:'absolute',left:'7%',right:'13%',top:'4%',bottom:'3%'},stats:{position:'absolute',zIndex:12,left:22,top:12,flexDirection:'row',alignItems:'center',gap:18},settingsButton:{width:42,height:42,alignItems:'center',justifyContent:'center',shadowColor:'#50464b',shadowOpacity:.17,shadowRadius:3.5,shadowOffset:{width:0,height:2}},levelGroup:{flexDirection:'row',alignItems:'center'},levelBadge:{zIndex:2,width:50,height:50,alignItems:'center',justifyContent:'center',shadowColor:'#4f4264',shadowOpacity:.24,shadowRadius:3.7,shadowOffset:{width:-1,height:3}},levelNumber:{position:'absolute',color:t.onAccent,fontSize:15,fontWeight:'600',textShadowColor:'rgba(68,53,85,.22)',textShadowOffset:{width:0,height:1},textShadowRadius:1.2},progress:{width:126,height:21,marginLeft:-6,borderRadius:12,backgroundColor:t.surfaceInset,overflow:'hidden',justifyContent:'center'},progressFill:{position:'absolute',left:0,top:0,bottom:0,width:'50%',backgroundColor:t.accent},progressText:{alignSelf:'center',color:t.textDim,fontSize:11,fontWeight:'600'},currencyGroup:{flexDirection:'row',alignItems:'center'},coinBadge:{zIndex:2,width:46,height:46,alignItems:'center',justifyContent:'center',shadowColor:'#76642e',shadowOpacity:.2,shadowRadius:3.5,shadowOffset:{width:-1,height:3}},currency:{width:126,height:21,marginLeft:-5,borderRadius:12,backgroundColor:t.surfaceInset,alignItems:'center',justifyContent:'center'},currencyText:{color:t.text,fontSize:12,fontWeight:'700'},
  roomControls:{position:'absolute',zIndex:13,left:24,bottom:78,flexDirection:'row',alignItems:'center',gap:10},controlGroup:{height:44,flexDirection:'row',alignItems:'center',gap:6,borderWidth:.65,borderColor:t.border,borderRadius:14,backgroundColor:t.surface,paddingHorizontal:7,shadowColor:'#8d8190',shadowOpacity:.14,shadowRadius:5,shadowOffset:{width:-2,height:4}},controlButton:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:t.surfaceRaised},controlButtonPressed:{backgroundColor:t.accentPressed,transform:[{scale:.94}]},controlSymbol:{color:t.text,fontSize:23,lineHeight:25,fontWeight:'800'},controlReadout:{minWidth:42,textAlign:'center',color:t.textDim,fontSize:12,fontWeight:'800'},
  rail:{position:'absolute',zIndex:14,right:18,top:58,width:78,height:238,paddingVertical:15,borderWidth:1.2,borderColor:t.border,borderRadius:18,backgroundColor:t.surface,alignItems:'center',justifyContent:'space-between',shadowColor:'#8d8190',shadowOpacity:.17,shadowRadius:7,shadowOffset:{width:-3,height:6}},railClosed:{top:22,width:78,height:52,paddingVertical:0,borderWidth:0,backgroundColor:'transparent',shadowOpacity:0},chevron:{position:'absolute',top:-34,width:48,height:34,alignItems:'center',justifyContent:'center'},chevronClosed:{top:0,width:58,height:30},collapsedPill:{position:'absolute',top:39,width:58,height:9,borderRadius:6,backgroundColor:t.surface,borderWidth:.65,borderColor:t.border,shadowColor:'#8d8190',shadowOpacity:.18,shadowRadius:4,shadowOffset:{width:-2,height:3}},railButton:{width:74,minHeight:58,alignItems:'center',justifyContent:'center'},railLabel:{fontSize:10.5,lineHeight:13,color:t.text,marginTop:1,fontWeight:'400',textAlign:'center'},workbench:{position:'absolute',zIndex:13,right:34,bottom:30,width:88,height:88,alignItems:'center',justifyContent:'center'},workbenchIcon:{width:88,height:88},
  furnitureWrap:{position:'absolute',zIndex:10,left:-55,top:-45,width:110,height:90},furnitureActive:{borderWidth:2,borderColor:t.accent,borderRadius:8},placeBar:{position:'absolute',zIndex:12,bottom:78,alignSelf:'center',flexDirection:'row',alignItems:'center',gap:10,borderRadius:22,backgroundColor:t.surface,paddingLeft:18,paddingRight:6,paddingVertical:6,shadowColor:'#000',shadowOpacity:.18,shadowRadius:8},placeHint:{color:t.textDim,fontWeight:'600'},deleteButton:{width:36,height:36,borderRadius:18,backgroundColor:t.surfaceRaised,alignItems:'center',justifyContent:'center'},confirm:{width:36,height:36,borderRadius:18,backgroundColor:t.success,alignItems:'center',justifyContent:'center'},
  comingSoonTitle:{fontSize:22,fontWeight:'900',color:t.text,textAlign:'center'},comingSoonBody:{marginTop:8,fontSize:14,fontWeight:'600',color:t.textDim,textAlign:'center'},comingSoonButton:{marginTop:18,minWidth:120},
});
