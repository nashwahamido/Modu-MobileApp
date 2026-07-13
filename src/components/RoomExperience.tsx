import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CartIcon, CheckIcon, ChevronIcon, CloseIcon, CoinMedalIcon, FriendsIcon, InventoryIcon, LevelStarIcon, SettingsIcon, ToolsIcon, TrashIcon } from './Icons';
import { RoomScene } from './RoomScene';

const products = ['Wooden Shelving Unit', 'Bed Slattum', 'Table', 'Chair', 'Shelves', 'Kids Desk', 'Stool', 'Sofa'];

function Cabinet() {
  return <View style={s.cabinet}><View style={s.topWood}/><View style={s.drawers}>{[0,1,2,3,4,5].map(i=><View key={i} style={s.drawer}><View style={s.knob}/></View>)}</View><View style={s.legs}><View style={s.leg}/><View style={s.leg}/></View></View>;
}

export function RoomExperience() {
  const { width, height } = useWindowDimensions();
  const [barOpen, setBarOpen] = useState(true);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(false);
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

  const chooseCabinet = () => { setInventoryOpen(false); setPlacing(true); setPlaced(false); position.setValue({ x: width * .47, y: height * .46 }); };
  const confirmPlacement = () => { setPlacing(false); setPlaced(true); };
  const editFurniture = () => { if (placed && !placing) setPlacing(true); };
  const deleteFurniture = () => { setPlacing(false); setPlaced(false); };

  return <View style={s.screen}>
    <View style={s.stage}><RoomScene /></View>
    <View style={s.stats}>
      <Pressable accessibilityLabel="Settings" style={s.settingsButton}><SettingsIcon size={40} color="#7b7175"/></Pressable>
      <View style={s.levelGroup}>
        <View style={s.levelBadge}><LevelStarIcon size={48}/><Text style={s.levelNumber}>1</Text></View>
        <View style={s.progress}><View style={s.progressFill}/><Text style={s.progressText}>50%</Text></View>
      </View>
      <View style={s.currencyGroup}>
        <View style={s.coinBadge}><CoinMedalIcon size={44}/></View>
        <View style={s.currency}><Text style={s.currencyText}>6767</Text></View>
      </View>
    </View>

    {(placing || placed) ? <Animated.View {...panResponder.panHandlers} style={[s.furnitureWrap,{ transform:[{translateX:position.x},{translateY:position.y},{scale}] }, placing && s.furnitureActive]}><Pressable accessibilityLabel={placing ? 'Selected furniture' : 'Edit furniture'} onPress={editFurniture}><Cabinet/></Pressable></Animated.View> : null}

    <View style={[s.rail,!barOpen&&s.railClosed]}><Pressable accessibilityLabel="Toggle menu" style={[s.chevron,!barOpen&&s.chevronClosed]} onPress={()=>setBarOpen(x=>!x)}><ChevronIcon size={barOpen?28:34} up={barOpen}/></Pressable>{barOpen?<><Pressable style={s.railButton}><CartIcon size={31}/><Text style={s.railLabel}>shop</Text></Pressable><Pressable style={s.railButton} onPress={()=>setInventoryOpen(true)}><InventoryIcon size={32}/><Text style={s.railLabel}>inventory</Text></Pressable><Pressable style={s.railButton}><FriendsIcon size={34}/><Text style={s.railLabel}>visit friends</Text></Pressable></>:<View style={s.collapsedPill}/>}</View>
    <Pressable style={s.workbench}><ToolsIcon size={28}/><Text style={s.workbenchText}>Workbench</Text></Pressable>

    {placing ? <View style={s.placeBar}><Text style={s.placeHint}>Drag to position</Text><Pressable accessibilityLabel="Delete furniture" style={s.deleteButton} onPress={deleteFurniture}><TrashIcon size={23}/></Pressable><Pressable accessibilityLabel="Confirm furniture position" style={s.confirm} onPress={confirmPlacement}><CheckIcon size={27}/></Pressable></View>:null}

    {inventoryOpen ? <View style={s.overlay}><View style={s.inventory}><View style={s.inventoryHeader}><View><Text style={s.inventoryTitle}>Inventory</Text><Text style={s.inventorySubtitle}>Furniture</Text></View><Pressable onPress={()=>setInventoryOpen(false)}><CloseIcon size={30}/></Pressable></View><View style={s.grid}>{products.map((name,index)=><Pressable key={name} style={s.card} onPress={index===0?chooseCabinet:undefined}><View style={s.preview}>{index===0?<Cabinet/>:<View style={s.emptyPreview}/>}</View><Text style={s.cardName}>{name}</Text></Pressable>)}</View></View></View>:null}
  </View>;
}

const s=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#f6efe4',overflow:'hidden'},stage:{position:'absolute',left:'7%',right:'13%',top:'4%',bottom:'3%'},stats:{position:'absolute',zIndex:12,left:22,top:12,flexDirection:'row',alignItems:'center',gap:18},settingsButton:{width:42,height:42,alignItems:'center',justifyContent:'center',shadowColor:'#50464b',shadowOpacity:.17,shadowRadius:3.5,shadowOffset:{width:0,height:2}},levelGroup:{flexDirection:'row',alignItems:'center'},levelBadge:{zIndex:2,width:50,height:50,alignItems:'center',justifyContent:'center',shadowColor:'#4f4264',shadowOpacity:.24,shadowRadius:3.7,shadowOffset:{width:-1,height:3}},levelNumber:{position:'absolute',color:'#fff',fontSize:15,fontWeight:'600',textShadowColor:'rgba(68,53,85,.22)',textShadowOffset:{width:0,height:1},textShadowRadius:1.2},progress:{width:126,height:21,marginLeft:-6,borderRadius:12,backgroundColor:'#e4dccf',overflow:'hidden',justifyContent:'center'},progressFill:{position:'absolute',left:0,top:0,bottom:0,width:'50%',backgroundColor:'#b6a6c6'},progressText:{alignSelf:'center',color:'#5e585d',fontSize:11,fontWeight:'600'},currencyGroup:{flexDirection:'row',alignItems:'center'},coinBadge:{zIndex:2,width:46,height:46,alignItems:'center',justifyContent:'center',shadowColor:'#76642e',shadowOpacity:.2,shadowRadius:3.5,shadowOffset:{width:-1,height:3}},currency:{width:126,height:21,marginLeft:-5,borderRadius:12,backgroundColor:'#e4dccf',alignItems:'center',justifyContent:'center'},currencyText:{color:'#4e4947',fontSize:12,fontWeight:'700'},
  rail:{position:'absolute',zIndex:14,right:18,top:58,width:78,height:238,paddingVertical:15,borderWidth:1.2,borderColor:'#d3cdce',borderRadius:18,backgroundColor:'rgba(255,254,249,.98)',alignItems:'center',justifyContent:'space-between',shadowColor:'#8d8190',shadowOpacity:.17,shadowRadius:7,shadowOffset:{width:-3,height:6}},railClosed:{top:22,width:78,height:52,paddingVertical:0,borderWidth:0,backgroundColor:'transparent',shadowOpacity:0},chevron:{position:'absolute',top:-34,width:48,height:34,alignItems:'center',justifyContent:'center'},chevronClosed:{top:0,width:58,height:30},collapsedPill:{position:'absolute',top:39,width:58,height:9,borderRadius:6,backgroundColor:'#fffef9',borderWidth:.65,borderColor:'#d3cdce',shadowColor:'#8d8190',shadowOpacity:.18,shadowRadius:4,shadowOffset:{width:-2,height:3}},railButton:{width:74,minHeight:58,alignItems:'center',justifyContent:'center'},railLabel:{fontSize:10.5,lineHeight:13,color:'#171515',marginTop:1,fontWeight:'400',textAlign:'center'},workbench:{position:'absolute',zIndex:13,right:20,bottom:18,width:162,height:44,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:13,borderWidth:.65,borderColor:'#d3cdce',borderRadius:13,backgroundColor:'rgba(255,254,249,.98)',shadowColor:'#8d8190',shadowOpacity:.16,shadowRadius:5.5,shadowOffset:{width:-3,height:5}},workbenchText:{fontSize:15.5,fontWeight:'600',color:'#171515'},
  furnitureWrap:{position:'absolute',zIndex:10,left:-55,top:-45,width:110,height:90},furnitureActive:{borderWidth:2,borderColor:'#268fe0',borderRadius:8},cabinet:{width:110,height:78,backgroundColor:'#b8783f',borderWidth:2,borderColor:'#754621'},topWood:{height:10,backgroundColor:'#d79a58'},drawers:{height:56,flexDirection:'row',flexWrap:'wrap'},drawer:{width:'33.33%',height:'50%',borderWidth:.7,borderColor:'#754621',alignItems:'center',justifyContent:'center'},knob:{width:4,height:4,borderRadius:2,backgroundColor:'#58331b'},legs:{height:12,flexDirection:'row',justifyContent:'space-between',paddingHorizontal:8},leg:{width:6,height:12,backgroundColor:'#754621'},placeBar:{position:'absolute',zIndex:12,bottom:16,alignSelf:'center',flexDirection:'row',alignItems:'center',gap:10,borderRadius:22,backgroundColor:'white',paddingLeft:18,paddingRight:6,paddingVertical:6,shadowColor:'#000',shadowOpacity:.18,shadowRadius:8},placeHint:{color:'#555',fontWeight:'600'},deleteButton:{width:36,height:36,borderRadius:18,backgroundColor:'#f6e0de',alignItems:'center',justifyContent:'center'},confirm:{width:36,height:36,borderRadius:18,backgroundColor:'#dcefdc',alignItems:'center',justifyContent:'center'},
  overlay:{...StyleSheet.absoluteFillObject,zIndex:20,backgroundColor:'rgba(30,30,30,.24)',alignItems:'center',justifyContent:'center'},inventory:{width:'82%',height:'84%',borderRadius:24,backgroundColor:'white',padding:22},inventoryHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},inventoryTitle:{fontSize:24,fontWeight:'700',color:'#333'},inventorySubtitle:{fontSize:13,color:'#777',marginTop:2},grid:{flex:1,flexDirection:'row',flexWrap:'wrap'},card:{width:'25%',height:'50%',padding:8,alignItems:'center'},preview:{width:'86%',flex:1,maxHeight:90,borderWidth:1.5,borderColor:'#ccc',borderRadius:10,backgroundColor:'#f8f7f4',alignItems:'center',justifyContent:'center',overflow:'hidden'},emptyPreview:{width:45,height:45,borderWidth:1.5,borderColor:'#bbb',transform:[{rotate:'45deg'}]},cardName:{fontSize:11,color:'#555',marginTop:5,textAlign:'center'},
});
