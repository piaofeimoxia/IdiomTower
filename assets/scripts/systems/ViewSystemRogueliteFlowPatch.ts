import { Node, UITransform, Color, Graphics, Label } from 'cc';
import { ViewSystem } from './ViewSystem';

type PatchedViewSystem = ViewSystem & {
    uiLayer?: Node | null;
    effectLayer?: Node | null;
    slots?: Array<{ node: Node; char: string; tile: any | null }>;
    tiles?: Array<any>;
    showTip?: (text: string) => void;
    createTile?: (char: string, index: number, x: number, y: number) => void;
    clearSlotsToHome?: () => void;

    __rogueChars?: string[];
    __rogueUnlockedIdioms?: string[];
    __rogueDiscardRoot?: Node | null;
    __rogueDiscardHandler?: (() => void) | null;
};

function setLabel(label: Label, text: string, fontSize: number, color: Color) {
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 7;
    label.color = color;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.enableWrapText = true;
    label.overflow = Label.Overflow.SHRINK;
}

function createPanel(parent: Node, name: string, x: number, y: number, w: number, h: number, color: Color, stroke: Color, radius = 16) {
    const node = new Node(name);
    parent.addChild(node);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(w, h);
    const g = node.addComponent(Graphics);
    g.fillColor = color;
    g.roundRect(-w / 2, -h / 2, w, h, radius);
    g.fill();
    g.strokeColor = stroke;
    g.lineWidth = 2;
    g.roundRect(-w / 2, -h / 2, w, h, radius);
    g.stroke();
    return node;
}

function createText(parent: Node, name: string, text: string, x: number, y: number, w: number, h: number, fontSize: number, color: Color) {
    const node = new Node(name);
    parent.addChild(node);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(w, h);
    const label = node.addComponent(Label);
    setLabel(label, text, fontSize, color);
    return node;
}

function createDiscardButton(self: PatchedViewSystem) {
    const parent = self.uiLayer;
    if (!parent || !parent.isValid) return;

    if (self.__rogueDiscardRoot && self.__rogueDiscardRoot.isValid) {
        self.__rogueDiscardRoot.destroy();
    }

    const root = createPanel(parent, 'rogue_discard_btn_v0861', 500, -272, 112, 50, new Color(50, 58, 72, 238), new Color(160, 190, 220, 150), 12);
    createText(root, 'discard_text', '弃左字', 0, 5, 100, 24, 20, new Color(235, 242, 255, 255));
    createText(root, 'discard_hint', '3秒', 0, -17, 100, 18, 15, new Color(170, 205, 230, 255));
    root.on(Node.EventType.TOUCH_END, () => self.__rogueDiscardHandler?.(), self);
    root.on(Node.EventType.MOUSE_UP, () => self.__rogueDiscardHandler?.(), self);
    self.__rogueDiscardRoot = root;
}

function installRogueliteFlowPatch() {
    const proto = ViewSystem.prototype as any;
    if (proto.__rogueliteFlowPatch0861) return;
    proto.__rogueliteFlowPatch0861 = true;

    proto.checkIdiom = function() {
        const self = this as PatchedViewSystem;
        const slots = self.slots ?? [];
        const text = slots.map(s => s.char).join('');
        if (text.length < 4) return;

        const unlocked = self.__rogueUnlockedIdioms ?? ['百步穿杨'];
        if (unlocked.includes(text)) {
            self.showTip?.(`已组成：${text}`);
            // 先把槽位清掉，再通知 SystemManager 消耗战斗袋，避免重建字块时访问已销毁节点。
            self.clearSlotsToHome?.();
            self.onIdiomComplete?.(text);
            return;
        }

        self.showTip?.(`未解锁成语：${text}`);
    };

    proto.setRogueliteState = function(chars: string[], unlockedIdioms: string[]) {
        const self = this as PatchedViewSystem;
        self.__rogueChars = [...chars];
        self.__rogueUnlockedIdioms = [...unlockedIdioms];
        this.rebuildRogueliteTiles?.();
    };

    proto.setRogueliteDiscardHandler = function(handler: (() => void) | null) {
        const self = this as PatchedViewSystem;
        self.__rogueDiscardHandler = handler;
        createDiscardButton(self);
    };

    proto.rebuildRogueliteTiles = function() {
        const self = this as PatchedViewSystem;
        if (!self.uiLayer || !self.uiLayer.isValid || !self.createTile) return;

        const oldTiles = self.tiles ?? [];
        for (const tile of oldTiles) {
            if (tile?.node && tile.node.isValid) tile.node.destroy();
        }
        self.tiles = [];

        const slots = self.slots ?? [];
        for (const slot of slots) {
            slot.char = '';
            slot.tile = null;
        }

        const chars = self.__rogueChars && self.__rogueChars.length > 0
            ? self.__rogueChars
            : [];

        const gap = 86;
        const y = -310;
        const startX = -((chars.length - 1) * gap) / 2;

        for (let i = 0; i < chars.length; i++) {
            self.createTile(chars[i], i, startX + i * gap, y);
        }

        createDiscardButton(self);
    };
}

installRogueliteFlowPatch();
