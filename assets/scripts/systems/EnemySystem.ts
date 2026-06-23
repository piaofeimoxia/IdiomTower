import { Enemy } from '../Enemy';

export class EnemySystem {
    enemies: Enemy[] = [];

    add(e:Enemy){ this.enemies.push(e); }
    remove(e:Enemy){ this.enemies=this.enemies.filter(x=>x!==e); }

    tick(dt:number){
        for(const e of this.enemies){ (e as any).update?.(dt); }
    }
}
