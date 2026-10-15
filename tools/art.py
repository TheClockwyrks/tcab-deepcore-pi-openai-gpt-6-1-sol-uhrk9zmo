"""One-time art authoring. Requires draw and draw-sheet; never part of the build."""
import json, random, subprocess, pathlib
random.seed(771)
ROOT=pathlib.Path('assets'); LOG=pathlib.Path('tools/art-logs'); LOG.mkdir(parents=True,exist_ok=True)
ops=[]
def rect(x,y,w,h,c): ops.append(dict(op='fill_rect',x=int(x),y=int(y),width=int(w),height=int(h),color=c))
def line(x,y,X,Y,c): ops.append(dict(op='line',x0=int(x),y0=int(y),x1=int(X),y1=int(Y),color=c))
def circ(x,y,r,c): ops.append(dict(op='fill_circle',cx=int(x),cy=int(y),r=int(r),color=c))
def save(path,w=80,h=80,sheet=False):
 p=ROOT/(path+'.png');p.parent.mkdir(parents=True,exist_ok=True);l=LOG/(path.replace('/','_')+'.json');l.write_text(json.dumps(ops));subprocess.run(['draw-sheet' if sheet else 'draw','render','--actions',str(l),'--out',str(p),'--width',str(w),'--height',str(h),'--no-layers'],check=True,stdout=subprocess.DEVNULL);ops.clear()
def grain(base,colors):
 rect(0,0,80,80,base)
 for i in range(950):
  x=random.randrange(80);y=random.randrange(80);rect(x,y,random.choice([1,1,2,3]),1,random.choice(colors))
 for i in range(8):
  x=random.randrange(70);y=random.randrange(80);line(x,y,x+random.randrange(4,14),y-2,colors[0])
for band,base,colors in [('topsoil','#554339',['#604c3d','#473b34','#6b5140','#3d3430']),('rockbed','#414b50',['#4a565c','#394347','#566165','#303b41']),('deepstone','#292e40',['#32384b','#232839','#3a4053','#202333']),('coreshell','#422c35',['#50313a','#352630','#60363a','#30242c'])]:
 for n in range(3): grain(base,colors);save(f'tiles/{band}-{n}')
grain('#151d25',['#1a2630','#101820','#22303a']);save('tiles/tunnel')
for n in range(2):
 circ(40-n*3,42,37-n*4,'#171f2b');circ(39-n*3,39,34-n*4,'#687887');circ(39-n*2,36,31-n*4,'#3e4d5b');
 for i in range(12-n*2): line(12+i*4+n*2,18+n*3,8+i*4+n*3,63-n*2,'#455866')
 line(16,22,51,10,'#9aafba');line(52,10,69,29,'#738e9f');save(f'tiles/stone-{n}')
grain('#1a2028',['#34414a','#28343e','#10181f']);
for x in range(0,80,20):line(x,0,x+20,80,'#0b141e')
save('tiles/bedrock')
orecolors=['#ba8d6f','#cec3a0','#dd8a58','#b8d9de','#649ce8','#d2dd61','#a3d5c0','#ff9d55','#ed6361','#b8a3f2','#5bf4aa','#f782c2','#ffe694']
names=['ferron','marlite','cuprite','argenite','cobaltine','voltite','halcite','pyronium','cindrite','adamite','verdite','roselite','aurite']
for n,c in zip(names,orecolors):
 if n in names[:10]:
  for i in range(160):
   x=random.randrange(80);y=int(37+13*__import__('math').sin(x*__import__('math').pi/40)+random.gauss(0,6));rect(x,y,random.randrange(2,9),random.randrange(1,4),c+random.choice(['55','88','bb','ee']))
  for i in range(22):
   x=random.randrange(80);y=int(37+13*__import__('math').sin(x*__import__('math').pi/40));line(x,y,x+4,y-2,'#fff3d4bb')
 else:
  for y in range(20,61):
   half=int((y-18)*1.1 if y<33 else (64-y)*1.15);rect(40-half,y,half*2,1,c)
  line(15,33,65,33,'#fff6de');line(15,33,40,61,'#ffffff88');line(65,33,40,61,'#201c4166');line(32,21,28,33,'#ffffff');line(28,33,40,61,'#ffffff99');line(48,21,51,33,'#24233b');line(51,33,40,61,'#24233b');line(58,18,58,30,'#ffffff');line(52,24,64,24,'#ffffff')
 save('ore/'+n)
for n,c in [('resonite','#6aefc5'),('cryenite','#bc9dff'),('core','#ffbd68'),('core-sample','#ffbd68')]:
 for x,y,r in [(29,46,16),(48,37,19),(55,51,12)]:
  for dy in range(-r,r):
   width=int((r-abs(dy))*.55)+2;rect(x-width,y+dy,width*2,1,c+'bb')
  line(x,y-r,x-3,y+r,c);line(x,y-r,x+6,y+3,'#f6fff5')
 circ(40,41,5,'#ffffff');save('materials/'+n)
for f in range(4):
 for i in range(f+2):
  a=i*2.4; x=int(40+__import__('math').cos(a)*35);y=int(40+__import__('math').sin(a)*35);line(40,37,x,y,'#11161ddd');line(41,38,x+1,y+1,'#dccba644')
 save(f'tiles/crack/frame{f:02}',sheet=True)
for f in range(3):
 grain('#b13b32',['#ef6538','#f5a43f','#792d34'])
 for i in range(10):
  x=random.randrange(80);y=random.randrange(80);line(x,y,x+18,y+3,'#ffd275');line(x,y+1,x+9,y+4,'#ffbc51')
 save(f'hazards/lava/frame{f:02}',sheet=True)
# Prospector: ivory helmet, amber pressure suit, cyan visor, steel drill, external jetpack.
for state,count in [('idle',4),('walk',6),('drill-down',4),('drill-side',4),('jetpack',4),('fall',4),('hurt',3),('fuel-out',3)]:
 for f in range(count):
  bob=[0,1,2,1][f%4];dx=(-1 if f%2 else 1) if 'drill' in state else 0
  if state=='hurt':dx=-4+f*2
  by=bob+(5 if state=='fuel-out' else 3 if state=='drill-side' else -4 if state=='jetpack' else -2 if state=='fall' else 0)
  if state=='jetpack':
   for x in [19,29]:circ(x,65,5,'#fba547');line(x,66,x+(f%2)*3,77-f*2,'#ffe9a0')
  rect(12+dx,30+by,18,30,'#111d29');rect(13+dx,31+by,13,24,'#647d88');rect(14+dx,34+by,4,17,'#b8c6bb');rect(15+dx,57+by,13,6,'#182532')
  # legs with alternating stride
  for i,x in enumerate([31,46]):
   offset=([0,4,7,0,-4,-7][f%6]*(1 if i else -1)) if state=='walk' else (7 if state=='fall' and i else -3 if state=='jetpack' else -4 if state=='drill-side' and i else 0)
   rect(x+dx,52+by,10,15+offset,'#a47745');rect(x+dx,54+by,4,13+offset,'#d9ad68');rect(x-2+dx,65+by+offset,15,6,'#17232b');rect(x-2+dx,65+by+offset,15,2,'#779098')
  rect(27+dx,29+by,30,29,'#c8924e');rect(29+dx,30+by,8,23,'#eed09a');rect(30+dx,53+by,28,5,'#273744');rect(42+dx,33+by,12,9,'#293f4a');rect(45+dx,35+by,5,3,'#74e3dc')
  circ(41+dx,20+by,18,'#13242e');circ(41+dx,19+by,16,'#e7d7af');rect(29+dx,19+by,28,14,'#1a3444');rect(33+dx,20+by,21,8,'#4c9caa');rect(36+dx,20+by,16,2,'#9ce7d6');rect(47+dx,11+by,13,6,'#b7a776');rect(54+dx,12+by,6,4,'#fff7b7' if f%2 else '#d9e7bc');rect(30+dx,14+by,3,8,'#fcf0d2')
  # drill changes orientation, not equipment
  if state=='drill-down':
   rect(49+dx,40+by,9,16,'#e6b867');rect(49+dx,53+by,16,13,'#526b79');rect(53+dx,65+by,8,7,'#b7c5ba');line(53+dx,72+by,57+dx,77,'#e7e3cd')
  else:
   rect(48+dx,40+by-(5 if state=='fall' else 0),14,9,'#edbf7b');rect(56+dx,44+by,14,13,'#435d6c');rect(58+dx,45+by,4,7,'#8aa2a6');line(69+dx,46+by,78,51+by,'#c3cdbf');line(69+dx,55+by,78,51+by,'#c3cdbf');line(69+dx,50+by,77,51+by,'#f0e9d0')
  save(f'miner/{state}/frame{f:02}',sheet=True)
# Surface engineering sprites
ids=['fuel-depot','ore-market','save-pad','upgrade-shop','supply-depot','launch-pad']
for idx,n in enumerate(ids):
 w=240;h=180
 rect(8,158,224,20,'#17232a');rect(3,155,234,5,'#9b9c86');rect(17,69,205,86,'#263c46');rect(20,73,199,7,'#6a7e7b');rect(20,81,199,70,'#344b53')
 for x in range(22,216,16):line(x,83,x,151,'#2b414b')
 rect(26,61,185,13,'#a5a58b');rect(31,62,172,3,'#d6cc9f');rect(38,91,70,43,'#101e2a');rect(42,95,62,29,'#438086');rect(45,96,55,4,'#a7d7be');rect(123,88,58,65,'#162a35');rect(130,97,40,10,'#b9b995');rect(145,118,18,7,'#e7b75e');
 for x in [27,211]:rect(x,77,5,77,'#87908a');circ(x+2,84,2,'#d6c6a0')
 if idx==0:
  for x in [28,76]:circ(x+17,46,20,'#152530');rect(x,23,34,44,'#a89565');rect(x+3,27,8,36,'#ded0a2');rect(x+12,37,20,8,'#bf714b')
 elif idx==1:
  for i in range(6):circ(35+i*13,54,8,orecolors[i]);line(178,35,178,60,'#9caeaa');line(156,39,200,39,'#9caeaa')
 elif idx==2:
  for i in range(3):rect(50+i*38,30+i*8,25,33,'#4ba7a6');rect(55+i*38,33+i*8,15,4,'#b5f1c9')
 elif idx==3:
  circ(85,45,23,'#152630');circ(85,45,18,'#c5b080');circ(85,45,10,'#263e4b');rect(83,17,5,56,'#aabdac')
 elif idx==4:
  for x in [48,86,124]:rect(x,35,30,27,'#b9864d');rect(x+3,38,24,3,'#ead2a0');line(x+4,43,x+23,58,'#4b4541')
 else:rect(55,23,6,45,'#758990');line(55,25,184,60,'#758990')
 save('surface/'+n,w,h)
for stage in range(6):
 rect(10,232,220,20,'#435461');rect(15,230,210,4,'#c0b890');rect(24,20,9,210,'#405967');
 for y in range(25,224,25):line(25,y,50,y+23,'#789093');line(50,y,25,y+23,'#789093')
 rect(49,18,5,214,'#405967')
 if stage:
  rect(92,92,57,130,'#adbcb1');rect(96,96,10,120,'#e8dfba');rect(137,96,10,120,'#637d83');rect(90,212,63,11,'#304551')
 if stage>=2:rect(94,161,53,11,'#c38d52');rect(94,178,53,11,'#c38d52')
 if stage>=3:
  circ(120,117,14,'#253c4d');circ(120,115,9,'#6ab8ba');line(114,110,126,110,'#d0e6c7')
 if stage>=4:
  for y in range(175,223):rect(76,y,int((y-175)*.36)+1,1,'#a27350');rect(150,y,int((y-175)*.36)+1,1,'#a27350')
 if stage>=5:
  for y in range(42,94):
   half=int((y-40)*.56);rect(120-half,y,half*2,1,'#dfd5b2');rect(120+half-6,y,6,1,'#83968f')
 save(f'rocket/stage{stage}',240,260,sheet=True)
# hand-textured sky panorama
rect(0,0,1280,480,'#101e2b')
for y in range(0,480,3):rect(0,y,1280,3,'#132633' if y>300 else '#101e2b')
for i in range(400):rect(random.randrange(1280),random.randrange(380),1,1,random.choice(['#547478','#375360','#a4b4a0']))
circ(1010,100,45,'#6d7c76');circ(1025,87,42,'#122331')
for i in range(30):
 x=i*47;peak=random.randrange(335,445)
 for y in range(peak,480):rect(x-(y-peak),y,2*(y-peak)+2,1,'#1d3540')
save('surface/sky',1280,480)
grain('#555347',['#6c6550','#3d4742','#8a7756']);save('surface/ground')
rect(0,0,80,80,'#18232b');circ(40,75,39,'#788079');circ(40,77,32,'#09131d');rect(8,65,5,15,'#c5ac78');rect(67,65,5,15,'#c5ac78');save('surface/cave-mouth')
for name in ['fuel','hull','cargo','credits','depth','resonite','cryenite','core-sample']:
 if name=='fuel':rect(6,5,12,17,'#d6b876');rect(9,2,6,4,'#d6b876');rect(9,9,6,9,'#283c47')
 elif name=='hull':
  for y in range(3,22):rect(12-int((22-y)*.5),y,max(2,int((22-y))),1,'#80cbc4')
 elif name=='cargo':rect(3,6,18,16,'#c9b58b');rect(5,8,14,11,'#263c48');line(5,8,18,19,'#c9b58b');rect(8,2,8,3,'#c9b58b')
 elif name=='credits':circ(12,12,10,'#e3c580');circ(12,12,7,'#605840');line(12,5,12,19,'#fff0b3');line(8,8,16,8,'#fff0b3');line(8,16,16,16,'#fff0b3')
 elif name=='depth':line(12,2,12,21,'#a7b7ae');line(6,15,12,21,'#a7b7ae');line(18,15,12,21,'#a7b7ae')
 else:
  c='#7be2c2' if name=='resonite' else '#c1a7ee' if name=='cryenite' else '#f1ba75'
  for y in range(3,22):rect(12-int((10-abs(y-12))*.6),y,max(1,int((10-abs(y-12))*1.2)),1,c)
 save('icons/'+name,24,24)
