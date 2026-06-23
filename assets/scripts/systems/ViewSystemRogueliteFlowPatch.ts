import { Node, UITransform, Color, Graphics, Vec3, Label } from 'cc';
import { ViewSystem } from './ViewSystem';
import type { RogueliteRewardOption, RewardRarity } from './ViewSystemRoguelitePatch';

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
    __rogueRewardRoot?: Node | null;
    __rogueDiscardRoot?: Node | null;
    __rogueDiscardHandler?: (() => void) | null;
};

const rarityName: Record<RewardRarity, string> = {
    common: '普通',
    rare: '稀有',
    epic: '史诗',
    gold: '金色',
};

const rarityColor: Record<RewardRarity, Color> = {
    common: new Color(226, 228, 220, 255),
    rare: new Color(118, 190, 255, 255),
    epic: new Color(198, 142, 255, 255),
    gold: new Color(255, 214, 96, 255),
};

const rarityPanelColor: Record<RewardRarity, Color> = {
    common: new Color(54, 60, 68, 250),
    rare: new Color(34, 66, 104, 250),
    epic: new Color(72, 48, 104, 250),
    gold: new Color(112, 78, 30, 250),
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

    proto.showRewardChoices = function(options: RogueliteRewardOption[], onPick: (option: RogueliteRewardOption) => void) {
        const self = this as PatchedViewSystem;
        const parent = self.effectLayer ?? self.uiLayer;
        if (!parent || !parent.isValid) return;

        if (self.__rogueRewardRoot && self.__rogueRewardRoot.isValid) {
            self.__rogueRewardRoot.destroy();
        }

        const root = new Node('roguelite_reward_root_v0861');
        parent.addChild(root);
        root.setPosition(0, 0, 0);
        root.addComponent(UITransform).setContentSize(1280, 720);
        self.__rogueRewardRoot = root;

        createPanel(root, 'reward_backdrop', 0, 0, 790, 330, new Color(18, 24, 34, 248), new Color(120, 150, 190, 135), 18);
        createText(root, 'reward_title', '升级奖励', 0, 126, 720, 40, 31, new Color(255, 236, 170, 255));
        createText(root, 'reward_subtitle', '战斗暂停，选择一个构筑方向', 0, 94, 720, 26, 19, new Color(188, 215, 235, 255));

        const xs = [-240, 0, 240];
        for (let i = 0; i < options.length; i++) {
            const opt = options[i];
            const card = createPanel(
                root,
                `reward_card_${i}`,
                xs[i],
                -34,
                204,
                190,
                rarityPanelColor[opt.rarity],
                rarityColor[opt.rarity],
                16
            );

            createText(card, `reward_rarity_${i}`, rarityName[opt.rarity], 0, 68, 174, 24, 18, rarityColor[opt.rarity]);
            createText(card, `reward_name_${i}`, opt.title, 0, 28, 176, 48, 23, Color.WHITE);
            createText(card, `reward_desc_${i}`, opt.desc, 0, -30, 176, 58, 16, new Color(220, 232, 240, 255));
            createText(card, `reward_hint_${i}`, '点击选择', 0, -78, 176, 20, 15, new Color(170, 220, 255, 255));

            const pick = () => {
                if (self.__rogueRewardRoot && self.__rogueRewardRoot.isValid) {
                    self.__rogueRewardRoot.destroy();
                }
                self.__rogueRewardRoot = null;
                onPick(opt);
            };
            card.on(Node.EventType.TOUCH_END, pick, self);
            card.on(Node.EventType.MOUSE_UP, pick, self);
        }
    };
}

installRogueliteFlowPatch();
