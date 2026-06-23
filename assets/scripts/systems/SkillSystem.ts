export type SkillId = 'wanjian' | 'guruo' | 'huadi';

export class SkillSystem {
    private cd: Record<SkillId, number> = { wanjian: 0, guruo: 0, huadi: 0 };

    private config = { wanjian:5, guruo:4, huadi:6, freeze:3 };

    onArrowRain?: () => void;
    onShield?: () => void;
    onFreeze?: (t:number)=>void;

    tick(dt:number){
        (Object.keys(this.cd) as SkillId[]).forEach(k=>{
            this.cd[k]=Math.max(0,this.cd[k]-dt);
        });
    }

    can(id:SkillId){ return this.cd[id]<=0; }

    use(id:SkillId){
        if(!this.can(id)) return false;
        if(id==='wanjian'){ this.cd[id]=this.config.wanjian; this.onArrowRain?.(); }
        if(id==='guruo'){ this.cd[id]=this.config.guruo; this.onShield?.(); }
        if(id==='huadi'){ this.cd[id]=this.config.huadi; this.onFreeze?.(this.config.freeze); }
        return true;
    }
}
