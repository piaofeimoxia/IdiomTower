export type LevelConfig = { name:string; totalEnemies:number; spawnInterval:number };

export class WaveSystem {
    private timer=0;
    private spawned=0;

    constructor(private level:LevelConfig){}

    onSpawn?:()=>void;

    tick(dt:number){
        if(this.spawned>=this.level.totalEnemies) return;
        this.timer+=dt;
        if(this.timer>=this.level.spawnInterval){
            this.timer=0;
            this.spawned++;
            this.onSpawn?.();
        }
    }

    reset(){ this.timer=0; this.spawned=0; }
}
