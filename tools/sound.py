"""One-time audio and particle authoring; not invoked by the build."""
import pathlib,json,subprocess
D=pathlib.Path('tools/audio-logs');D.mkdir(exist_ok=True)
def run(tool,c,*args):
 subprocess.run([tool,'--config',str(c),*map(str,args)],check=True,stdout=subprocess.DEVNULL)
def config(name,kind='sfx'):
 p=D/(name+'.config.json');base=dict(sample_rate=22050,channels='stereo',max_duration_ms=24000 if kind=='music' else 4000,seed=817,actions=str(D/(name+'.json')),preview=str(D/(name+'.png')),wav='assets/audio/'+name+'.wav',mid='assets/audio/'+name+'.mid')
 p.write_text(json.dumps(base));return p
pathlib.Path('assets/audio').mkdir(exist_ok=True)
for name,freq,dur,wave in [('drill',66,500,'saw'),('thrust',90,750,'noise'),('ore-pickup',880,200,'sine'),('material-chime',660,600,'triangle'),('gas-explosion',45,900,'noise'),('lava-sizzle',200,450,'noise'),('impact',60,260,'noise'),('fabricate',520,260,'triangle'),('launch',55,2600,'noise'),('death',120,800,'saw'),('alarm-fuel',440,400,'sine'),('alarm-core',660,250,'square')]:
 c=config(name);run('sfx-synth',c,'init');run('sfx-synth',c,'add-voice','--name','body','--wave',wave,'--freq',freq,'--dur',dur,'--gain',-22 if name in ['drill','thrust'] else -14)
 if wave=='noise':run('sfx-synth',c,'add-voice','--name','sub','--wave','sine','--freq',freq,'--dur',dur,'--gain',-16)
 if name in ['ore-pickup','material-chime','fabricate']:
  for i,m in enumerate([1.25,1.5,2]):run('sfx-synth',c,'add-voice','--name','o'+str(i),'--wave','sine','--freq',freq*m,'--dur',dur,'--gain',-23,'--start',i*50)
 run('sfx-synth',c,'render')
c=config('music','music');run('music',c,'init');run('music',c,'set-tempo','--bpm',80)
for name,inst in [('bass','sine'),('pulse','triangle'),('air','sine')]:run('music',c,'define-track','--name',name,'--instrument',inst)
for i in range(32):
 run('music',c,'add-note','--track','pulse','--pitch',[62,69,74,65,64,69,72,57][i%8],'--t',i,'--dur',.6,'--velocity',34)
 if i%4==0:
  run('music',c,'add-note','--track','bass','--pitch',[38,34,41,36][i//8],'--t',i,'--dur',3.7,'--velocity',47)
  run('music',c,'add-note','--track','air','--pitch',[74,77,72,69][i//8],'--t',i,'--dur',3.8,'--velocity',20)
run('music',c,'render')
pathlib.Path('assets/fx').mkdir(exist_ok=True)
for name,c,burst,speed,life in [('gas-seep','#9abda2',6,14,1500),('drill-debris','#c8a179',20,100,500),('jetpack-exhaust','#ffb76b',18,120,380),('ore-sparkle','#ffe1a0',24,75,650),('material-shimmer','#8fffe1',45,100,1000),('gas-explosion','#ffac62',100,240,900),('lava-embers','#ff8b48',35,100,700),('impact-dust','#c8c0a0',35,90,650),('core-extract','#e8b9ff',70,150,1000),('core-detonation','#ffcdb1',220,500,1600),('launch-exhaust','#ffd491',100,250,1700),('death-burst','#a8d9d5',65,180,1200)]:
 p=D/('fx-'+name+'.config.json');p.write_text(json.dumps(dict(width=400,height=400,duration=2,duration_ms=2000,fps=24,seed=17,actions=str(D/('fx-'+name+'.json')),preview=str(D/('fx-'+name+'.gif')),system='assets/fx/'+name+'.json')))
 run('particle-2d',p,'init');run('particle-2d',p,'add-emitter','--name','body','--shape','disc','--radius',8,'--x',200,'--y',200,'--burst',burst,'--lifetime',life,'--speed',speed,'--speed-spread',speed*.5,'--cone-angle',180 if 'exhaust' not in name else 22,'--dir-y',-1 if 'exhaust' in name else 1)
 run('particle-2d',p,'set-particle','--emitter','body','--size-from',.7 if 'seep' in name else .25,'--size-to',1.4 if 'seep' in name else 0,'--opacity-from',.18 if 'seep' in name else .9,'--opacity-to',0,'--color-gradient',c+'@0,#445867@1')
 run('particle-2d',p,'render','--frame',12,'--out',str(D/('fx-'+name+'.png')))
