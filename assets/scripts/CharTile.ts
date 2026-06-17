import { _decorator, Component, Node, Vec3, EventTouch, UITransform } from 'cc';
import { GameManager } from './GameManager';
const { ccclass } = _decorator;

@ccclass('CharTile')
export class CharTile extends Component {
    public char = '';
    public slotIndex = -1;

    private homePos = new Vec3();
    private dragging = false;

    public init(char: string, homePos: Vec3) {
        this.char = char;
        this.homePos = homePos.clone();
    }

    onLoad() {
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    onDestroy() {
        this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    private onTouchStart() {
        this.dragging = true;
        this.node.setScale(1.15, 1.15, 1);
        this.node.setSiblingIndex(999);
    }

    private onTouchMove(event: EventTouch) {
        if (!this.dragging || !this.node.parent) return;
        const uiPos = event.getUILocation();
        const parentUI = this.node.parent.getComponent(UITransform);
        if (!parentUI) return;
        const local = parentUI.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
        this.node.setPosition(local);
    }

    private onTouchEnd() {
        if (!this.dragging) return;
        this.dragging = false;
        this.node.setScale(1, 1, 1);

        const placed = GameManager.inst.tryPlaceTile(this);
        if (!placed) {
            this.resetToHome();
        }
    }

    public lockToSlot(index: number, pos: Vec3) {
        this.slotIndex = index;
        this.node.setPosition(pos);
    }

    public resetToHome() {
        this.slotIndex = -1;
        this.node.setPosition(this.homePos);
    }
}
