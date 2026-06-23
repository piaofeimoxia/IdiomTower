
import { Component } from 'cc';
import { SystemManager } from './SystemManager';

export class GameManager extends Component {

    public static inst: GameManager;
    public systemManager: SystemManager;

    onLoad() {
        GameManager.inst = this;
        this.systemManager = new SystemManager();
        this.systemManager.initLevel();
    }

    update(dt: number) {
        this.systemManager.tick(dt);
    }
}
