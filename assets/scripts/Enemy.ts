import { _decorator, Component } from 'cc';
import { GameManager } from './GameManager';

const { ccclass } = _decorator;

@ccclass('Enemy')
export class Enemy extends Component {
    public damage = 1;

    private speed = 80;
    private hp = 1;
    private hitX = 145;
    private dead = false;

    public init(speed: number, hp = 1, damage = 1, hitX = 145) {
        this.speed = speed;
        this.hp = hp;
        this.damage = damage;
        this.hitX = hitX;
    }

    update(dt: number) {
        if (this.dead) return;

        const p = this.node.position;
        this.node.setPosition(p.x + this.speed * dt, p.y, p.z);

        if (this.node.position.x >= this.hitX) {
            GameManager.inst.enemyHitGate(this);
        }
    }

    public takeDamage(damage: number) {
        if (this.dead) return;

        this.hp -= damage;
        if (this.hp <= 0) {
            this.dead = true;
            GameManager.inst.removeEnemy(this, true);
            this.node.destroy();
        }
    }
}
