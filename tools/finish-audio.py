"""Final sound design pass and multi-layer blast systems."""
exec(open('tools/sound.py').read().split("pathlib.Path('assets/audio').mkdir")[0])
for name,sample,gain,pitch in [('ore-pickup','mech_clip_load',-22,5),('material-chime','clang_metal',-28,12),('fabricate','mech_ratchet',-20,4),('impact','impact_metal_hollow',-20,-3)]:
 c=D/(name+'.config.json');run('sfx-sample',c,'add-sample','--name',sample,'--t',0,'--gain',gain,'--pitch',pitch);run('sfx-sample',c,'render')
c=D/'music.config.json'
for name,pan,env in [('bass',0,'swell'),('pulse',-.25,'pluck'),('air',.3,'swell')]:
 run('music',c,'set-track-fx','--track',name,'--gain',-11,'--pan',pan,'--reverb',.3,'--env',env)
run('music',c,'render')
for name in ['gas-explosion','core-detonation']:
 c=D/('fx-'+name+'.config.json')
 run('particle-2d',c,'add-emitter','--name','shockwave','--shape','disc','--radius',2,'--x',200,'--y',200,'--burst',150,'--lifetime',280,'--speed',550 if name=='core-detonation' else 350,'--cone-angle',180)
 run('particle-2d',c,'set-particle','--emitter','shockwave','--size-from',.45,'--size-to',.1,'--opacity-from',.9,'--opacity-to',0,'--color-gradient','#fff1bf@0,#e98969@1')
 run('particle-2d',c,'add-emitter','--name','flash','--shape','point','--x',200,'--y',200,'--burst',1,'--lifetime',120,'--speed',0)
 run('particle-2d',c,'set-particle','--emitter','flash','--size-from',15,'--size-to',0,'--opacity-from',1,'--opacity-to',0,'--color-gradient','#fff5d2@0,#ffc377@1')
 run('particle-2d',c,'render','--frame',4,'--out',str(D/('fx-'+name+'.png')))
