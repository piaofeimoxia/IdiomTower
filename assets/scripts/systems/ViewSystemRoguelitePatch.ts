import { Node, UITransform, Color, Graphics, Vec3, Label } from 'cc';
import { ViewSystem } from './ViewSystem';

export type RewardRarity = 'common' | 'rare' | 'epic' | 'gold';

export type RogueliteRewardOption = {
    id: string;
    rarity: RewardRarity;
    title: string;
    desc: string;
};

type PatchedViewSystem = ViewSystem & {
    uiLayer?: Node | null;
    effectLayer?: Node | null;
    slots?: Array<{ node: Node; char: string; tile: any | null }>;
    tiles?: Array<any>;
    showTip?: (text: string) => void;
    createTile?: (char: string, index: number, x: number, y: number) => void;
    clearSlotsToHome?: () => void;
    createText?: (parent: Node | null, name: string, text: string, x: number, y: number, size: number, color: Color) => Node;
    createImageNode?: (parent: Node | null, name: string, resourcePaths: string[], x: number, y: number, w: number, h: number, fallbackText: string, fallbackFontSize: number) => Node;
    getTileTexture?: (char: string) => string;

    __rogueChars?: string[];
    __rogueUnlockedIdioms?: string[];
    __rogueRewardRoot?: Node | null;
};

const rarityColor: Record<RewardRarity, Color> = {
    common: new Color(226, 228, 220, 255),
    rare: new Color(120, 190, 255, 255),
    epic: new Color(190, 135, 255, 255),
    gold: new Color(255, 212, 92, 255),
};

const rarityPanelColor: Record<RewardRarity, Color> = {
    common: new Color(64, 70, 78, 248),
    rare: new Color(42, 70, 106, 248),
    epic: new Color(74, 48, 104, 248),
    gold: new Color(118, 84, 32, 248),
};

function createPanel(parent: Node, name: string, x: number, y: number, w: number, h: number, color: Color, stroke: Color) {
    const node = new Node(name);
    parent.addChild(node);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(w, h);
    const g = node.addComponent(Graphics);
    g.fillColor = color;
    g.roundRect(-w / 2, -h / 2, w, h, 18);
    g.fill();
    g.strokeColor = stroke;
    g.lineWidth = 3;
    g.roundRect(-w / 2, -h / 2, w, h, 18);
    g.stroke();
    return node;
}

function createText(parent: Node, name: string, text: string, x: number, y: number, w: number, h: number, fontSize: number, color: Color) {
    const node = new Node(name);
    parent.addChild(node);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(w, h);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 8;
    label.color = color;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    return node;
}

function installRoguelitePatch() {
    const proto = ViewSystem.prototype as any;
    if (proto.__roguelitePatch086) return;
    proto.__roguelitePatch086 = true;

    const oldGetTileTexture = proto.getTileTexture;
    proto.getTileTexture = function(char: string) {
        if (char === '百' || char === '步' || char === '穿' || char === '杨') return '';
        return oldGetTileTexture.call(this, char);
    };

    const oldCheckIdiom = proto.checkIdiom;
    proto.checkIdiom = function() {
        const self = this as PatchedViewSystem;
        const slots = self.slots ?? [];
        const text = slots.map(s => s.char).join('');
        if (text.length < 4) return;

        const unlocked = self.__rogueUnlockedIdioms ?? ['百步穿杨'];
        if (unlocked.includes(text)) {
            self.showTip?.(`已组成：${text}`);
            self.onIdiomComplete?.(text);
            self.clearSlotsToHome?.();
            return;
        }

        // 兼容旧系统默认三个成语。
        if (!self.__rogueUnlockedIdioms) {
            oldCheckIdiom.call(this);
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
            : ['百', '步', '穿', '杨', '百', '步'];

        const gap = 86;
        const row1Y = -272;
        const row2Y = -348;
        const maxFirstRow = Math.min(7, chars.length);
        const row1Count = Math.min(maxFirstRow, chars.length);
        const row2Count = Math.max(0, chars.length - row1Count);
        const row1StartX = -((row1Count - 1) * gap) / 2;
        const row2StartX = -((row2Count - 1) * gap) / 2;

        for (let i = 0; i < chars.length; i++) {
            const row = i < row1Count ? 0 : 1;
            const col = row === 0 ? i : i - row1Count;
            const x = row === 0 ? row1StartX + col * gap : row2StartX + col * gap;
            const y = row === 0 ? row1Y : row2Y;
            self.createTile(chars[i], i, x, y);
        }
    };

    proto.showRogueliteHud = function(text: string) {
        const self = this as PatchedViewSystem;
        self.showTip?.(text);
    };

    proto.showRewardChoices = function(options: RogueliteRewardOption[], onPick: (option: RogueliteRewardOption) => void) {
        const self = this as PatchedViewSystem;
        const parent = self.effectLayer ?? self.uiLayer;
        if (!parent || !parent.isValid) return;

        if (self.__rogueRewardRoot && self.__rogueRewardRoot.isValid) {
            self.__rogueRewardRoot.destroy();
        }

        const root = new Node('roguelite_reward_root_v086');
        parent.addChild(root);
        root.setPosition(0, 0, 0);
        root.addComponent(UITransform).setContentSize(1280, 720);
        self.__rogueRewardRoot = root;

        createPanel(root, 'reward_backdrop', 0, 0, 860, 390, new Color(24, 30, 40, 248), new Color(140, 160, 190, 130));
        createText(root, 'reward_title', '升级奖励：选择一个', 0, 145, 780, 42, 32, new Color(255, 236, 170, 255));
        createText(root, 'reward_subtitle', '选择奖励时战斗暂停', 0, 106, 780, 30, 20, new Color(190, 220, 235, 255));

        const xs = [-260, 0, 260];
        for (let i = 0; i < options.length; i++) {
            const opt = options[i];
            const panel = createPanel(
                root,
                `reward_card_${i}`,
                xs[i],
                -28,
                224,
                214,
                rarityPanelColor[opt.rarity],
                rarityColor[opt.rarity]
            );

            createText(panel, `reward_rarity_${i}`, opt.rarity === 'gold' ? '金色' : opt.rarity === 'epic' ? '史诗' : opt.rarity === 'rare' ? '稀有' : '普通', 0, 72, 190, 28, 20, rarityColor[opt.rarity]);
            createText(panel, `reward_name_${i}`, opt.title, 0, 28, 190, 46, 25, Color.WHITE);
            createText(panel, `reward_desc_${i}`, opt.desc, 0, -28, 190, 72, 18, new Color(220, 232, 240, 255));
            createText(panel, `reward_hint_${i}`, '点击选择', 0, -82, 190, 24, 17, new Color(170, 220, 255, 255));

            const pick = () => {
                if (self.__rogueRewardRoot && self.__rogueRewardRoot.isValid) {
                    self.__rogueRewardRoot.destroy();
                }
                self.__rogueRewardRoot = null;
                onPick(opt);
            };
            panel.on(Node.EventType.TOUCH_END, pick, self);
            panel.on(Node.EventType.MOUSE_UP, pick, self);
        }
    };
}

installRoguelitePatch();
